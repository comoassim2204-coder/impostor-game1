const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

let salas = {};

const palavras = {
  animais: ["cachorro", "gato", "elefante", "leão", "girafa", "papagaio", "tartaruga", "rinoceronte"],
  comida: ["pizza", "hamburguer", "sushi", "bolo", "lasanha", "churrasco", "tacos", "sorvete"],
  profissao: ["médico", "engenheiro", "professor", "piloto", "cozinheiro", "bombeiro", "designer", "jornalista"],
  lugares: ["praia", "escola", "aeroporto", "cinema", "parque", "biblioteca", "restaurante", "estádio"]
};

function gerarCodigo() {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

function enviarSistema(codigo, msg) {
  io.to(codigo).emit("status", msg);
}

function atualizarSala(codigo) {
  const sala = salas[codigo];
  if (!sala) return;
  io.to(codigo).emit("updateSala", {
    jogadores: sala.jogadores,
    tema: sala.tema,
    etapa: sala.etapa,
    host: sala.host,
    vez: sala.vez,
    palavra: sala.palavra,
    rodadaAtual: sala.rodadaAtual
  });
}

function iniciarRodada(codigo) {
  const sala = salas[codigo];
  if (!sala) return;

  const lista = palavras[sala.tema] || palavras.animais;
  const palavra = lista[Math.floor(Math.random() * lista.length)];
  sala.palavra = palavra;
  sala.impostor = sala.jogadores[Math.floor(Math.random() * sala.jogadores.length)].id;
  sala.etapa = "discussion";
  sala.vez = 0;
  sala.votos = {};
  sala.rodadaAtual += 1;

  sala.jogadores.forEach((j) => {
    if (j.id === sala.impostor) {
      io.to(j.id).emit("role", "IMPOSTOR");
    } else {
      io.to(j.id).emit("role", palavra);
    }
  });

  atualizarSala(codigo);
  enviarSistema(codigo, `Rodada ${sala.rodadaAtual} iniciada! ${sala.jogadores[sala.vez].nome} começa falando.`);
  io.to(codigo).emit("turno", sala.jogadores[sala.vez].id);
}

io.on("connection", (socket) => {
  socket.on("criarSala", ({ nome, tema }) => {
    const codigo = gerarCodigo();
    const nomeJogador = nome && nome.trim() !== "" ? nome.trim() : "Jogador";

    salas[codigo] = {
      jogadores: [],
      tema,
      palavra: "",
      impostor: null,
      host: socket.id,
      etapa: "waiting",
      vez: -1,
      votos: {},
      rodadaAtual: 0
    };

    salas[codigo].jogadores.push({
      id: socket.id,
      nome: nomeJogador,
      pontos: 0
    });

    socket.join(codigo);
    socket.emit("salaCriada", { codigo, host: socket.id, tema });
    atualizarSala(codigo);
    enviarSistema(codigo, `Sala criada! Aguarde outros jogadores e comece quando estiver pronto.`);
  });

  socket.on("entrarSala", ({ nome, codigo }) => {
    const sala = salas[codigo];
    if (!sala) {
      socket.emit("erro", "Sala não encontrada.");
      return;
    }

    if (sala.etapa !== "waiting") {
      socket.emit("erro", "O jogo já começou. Aguarde a próxima rodada.");
      return;
    }

    const nomeJogador = nome && nome.trim() !== "" ? nome.trim() : "Jogador";
    socket.join(codigo);

    sala.jogadores.push({
      id: socket.id,
      nome: nomeJogador,
      pontos: 0
    });

    enviarSistema(codigo, `${nomeJogador} entrou na sala.`);
    atualizarSala(codigo);
  });

  socket.on("atualizarTema", ({ codigo, tema }) => {
    const sala = salas[codigo];
    if (!sala) {
      socket.emit("erro", "Sala não existe.");
      return;
    }
    if (sala.host !== socket.id) {
      socket.emit("erro", "Apenas o host pode mudar o tema.");
      return;
    }
    if (sala.etapa !== "waiting" && sala.etapa !== "round_result") {
      socket.emit("erro", "Só é possível mudar o tema antes do início ou após a rodada." );
      return;
    }
    sala.tema = tema;
    atualizarSala(codigo);
    enviarSistema(codigo, `Tema atualizado para ${tema}.`);
  });

  socket.on("iniciarJogo", (codigo) => {
    const sala = salas[codigo];
    if (!sala) {
      socket.emit("erro", "Sala não existe.");
      return;
    }

    if (sala.host !== socket.id) {
      socket.emit("erro", "Apenas o host pode iniciar o jogo.");
      return;
    }

    if (sala.jogadores.length < 3) {
      socket.emit("erro", "É preciso pelo menos 3 jogadores para iniciar.");
      return;
    }

    if (sala.etapa !== "waiting") {
      socket.emit("erro", "O jogo já foi iniciado.");
      return;
    }

    iniciarRodada(codigo);
  });

  socket.on("mensagem", ({ codigo, msg }) => {
    const sala = salas[codigo];
    if (!sala) return;
    if (sala.etapa !== "discussion") return;

    const jogadorAtual = sala.jogadores[sala.vez % sala.jogadores.length];
    if (jogadorAtual.id !== socket.id) {
      socket.emit("erro", "Não é sua vez de falar.");
      return;
    }

    const jogador = sala.jogadores.find((j) => j.id === socket.id);
    io.to(codigo).emit("novaMensagem", {
      nome: jogador.nome,
      msg: msg.trim() || "..."
    });

    sala.vez += 1;
    if (sala.vez >= sala.jogadores.length) {
      sala.etapa = "voting";
      sala.vez = -1;
      atualizarSala(codigo);
      io.to(codigo).emit("votacao", { jogadores: sala.jogadores });
      enviarSistema(codigo, "Discussão encerrada. Agora votem no impostor.");
    } else {
      atualizarSala(codigo);
      const proximo = sala.jogadores[sala.vez % sala.jogadores.length];
      io.to(codigo).emit("turno", proximo.id);
      enviarSistema(codigo, `Próxima pessoa: ${proximo.nome}.`);
    }
  });

  socket.on("votar", ({ codigo, alvo }) => {
    const sala = salas[codigo];
    if (!sala) return;
    if (sala.etapa !== "voting") return;

    if (!sala.jogadores.some((j) => j.id === alvo)) {
      socket.emit("erro", "Jogador inválido.");
      return;
    }

    sala.votos[socket.id] = alvo;
    if (Object.keys(sala.votos).length === sala.jogadores.length) {
      const contagem = {};
      Object.values(sala.votos).forEach((voto) => {
        contagem[voto] = (contagem[voto] || 0) + 1;
      });

      const maisVotado = Object.keys(contagem).reduce((a, b) =>
        contagem[a] > contagem[b] ? a : b
      );

      const acertaram = maisVotado === sala.impostor;
      const impostorNome = sala.jogadores.find((j) => j.id === sala.impostor).nome;
      const alvoNome = sala.jogadores.find((j) => j.id === maisVotado).nome;

      if (acertaram) {
        sala.jogadores.forEach((j) => {
          if (sala.votos[j.id] === sala.impostor) {
            j.pontos += 2;
          }
        });
      } else {
        const impostor = sala.jogadores.find((j) => j.id === sala.impostor);
        if (impostor) {
          impostor.pontos += 3;
        }
      }

      sala.etapa = "round_result";
      atualizarSala(codigo);

      io.to(codigo).emit("resultado", {
        acertaram,
        palavra: sala.palavra,
        impostorNome,
        alvoNome,
        jogadores: sala.jogadores,
        votos: sala.votos,
        final: false
      });

      enviarSistema(codigo, acertaram ? "Tripulação venceu!" : "Impostor venceu!");
    }
  });

  socket.on("continuarRodada", (codigo) => {
    const sala = salas[codigo];
    if (!sala) {
      socket.emit("erro", "Sala não existe.");
      return;
    }
    if (sala.host !== socket.id) {
      socket.emit("erro", "Apenas o host pode continuar o jogo.");
      return;
    }
    if (sala.etapa !== "round_result") {
      socket.emit("erro", "Não é possível continuar agora.");
      return;
    }

    iniciarRodada(codigo);
  });

  socket.on("encerrarJogo", (codigo) => {
    const sala = salas[codigo];
    if (!sala) {
      socket.emit("erro", "Sala não existe.");
      return;
    }
    if (sala.host !== socket.id) {
      socket.emit("erro", "Apenas o host pode encerrar o jogo.");
      return;
    }
    if (sala.etapa !== "round_result") {
      socket.emit("erro", "Só é possível encerrar após a votação.");
      return;
    }

    sala.etapa = "ended";
    atualizarSala(codigo);

    const vencedores = sala.jogadores
      .slice()
      .sort((a, b) => b.pontos - a.pontos)
      .filter((j, _, arr) => j.pontos === arr[0].pontos)
      .map((j) => j.nome);

    io.to(codigo).emit("resultado", {
      final: true,
      abortado: true,
      palavra: sala.palavra,
      impostorNome: sala.jogadores.find((j) => j.id === sala.impostor)?.nome || "",
      jogadores: sala.jogadores,
      rodadaAtual: sala.rodadaAtual,
      vencedores
    });

    enviarSistema(codigo, "Jogo encerrado pelo host. Confira o placar final.");
  });

  socket.on("reiniciarJogo", (codigo) => {
    const sala = salas[codigo];
    if (!sala) {
      socket.emit("erro", "Sala não existe.");
      return;
    }
    if (sala.host !== socket.id) {
      socket.emit("erro", "Apenas o host pode reiniciar o jogo.");
      return;
    }
    if (sala.jogadores.length < 3) {
      socket.emit("erro", "É preciso pelo menos 3 jogadores para reiniciar.");
      return;
    }

    sala.etapa = "waiting";
    sala.palavra = "";
    sala.impostor = null;
    sala.vez = -1;
    sala.votos = {};
    sala.rodadaAtual = 0;

    atualizarSala(codigo);
    io.to(codigo).emit("reiniciar");
    enviarSistema(codigo, "Jogo reiniciado. Host pode iniciar uma nova rodada.");
  });

  socket.on("disconnect", () => {
    for (const codigo in salas) {
      const sala = salas[codigo];
      const index = sala.jogadores.findIndex((j) => j.id === socket.id);
      if (index !== -1) {
        const nome = sala.jogadores[index].nome;
        sala.jogadores.splice(index, 1);
        if (sala.jogadores.length === 0) {
          delete salas[codigo];
        } else {
          if (sala.host === socket.id) {
            sala.host = sala.jogadores[0].id;
            enviarSistema(codigo, `O host saiu. ${sala.jogadores[0].nome} agora é o host.`);
          }
          if (sala.etapa === "discussion" && sala.vez >= sala.jogadores.length) {
            sala.vez = 0;
          }
          atualizarSala(codigo);
          enviarSistema(codigo, `${nome} saiu da sala.`);
        }
        break;
      }
    }
  });
});

server.listen(3000, () => {
  console.log("Rodando na porta 3000");
});