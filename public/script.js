const socket = io();
let codigoAtual = "";
let meuId = "";
let salaInfo = null;
let minhaPalavra = "";
let votoSelecionado = null;

socket.on("connect", () => {
  meuId = socket.id;
});

socket.on("status", (msg) => {
  atualizarStatus(msg);
});

function switchTab(tab) {
  document.getElementById("createPanel").style.display = tab === "create" ? "block" : "none";
  document.getElementById("joinPanel").style.display = tab === "join" ? "block" : "none";
  document.getElementById("tabCreate").classList.toggle("active", tab === "create");
  document.getElementById("tabJoin").classList.toggle("active", tab === "join");
}

function criarSala() {
  const nome = document.getElementById("nome").value;
  const tema = document.getElementById("tema").value;
  socket.emit("criarSala", { nome, tema });
}

function atualizarTema() {
  const tema = document.getElementById("temaGame").value;
  socket.emit("atualizarTema", { codigo: codigoAtual, tema });
}

function entrarSala() {
  const nome = document.getElementById("nome").value;
  const codigo = document.getElementById("codigo").value.toUpperCase();
  if (!codigo) {
    alert("Digite o código da sala.");
    return;
  }
  codigoAtual = codigo;
  socket.emit("entrarSala", { nome, codigo });
}

socket.on("salaCriada", ({ codigo, host, tema }) => {
  codigoAtual = codigo;
  salaInfo = { host, tema, rodadaAtual: 0, etapa: "waiting", jogadores: [] };
  mostrarSala();
  atualizarStatus("Sala criada. Aguarde outros jogadores e inicie quando estiver pronto.");
});

socket.on("updateSala", (info) => {
  salaInfo = info;
  if (!codigoAtual && info && info.codigo) {
    codigoAtual = info.codigo;
  }
  mostrarSala();
});

socket.on("role", (palavra) => {
  minhaPalavra = palavra;
  document.getElementById("palavra").innerText = palavra;
});

socket.on("turno", (idAtual) => {
  if (!salaInfo) return;
  const jogador = salaInfo.jogadores.find((j) => j.id === idAtual);
  document.getElementById("turno").innerText = jogador ? `Vez de: ${jogador.nome}` : "";
  const enviarButton = document.getElementById("btnEnviar");
  const inputMsg = document.getElementById("msg");
  const podeFalar = idAtual === meuId;
  enviarButton.disabled = !podeFalar;
  inputMsg.disabled = !podeFalar;
  inputMsg.placeholder = podeFalar ? "Digite sua mensagem" : "Aguarde sua vez de falar...";
  atualizarStatus(podeFalar ? "Sua vez de falar" : jogador ? `Próxima pessoa: ${jogador.nome}` : "Aguarde sua vez.");
});

socket.on("novaMensagem", ({ nome, msg }) => {
  const chat = document.getElementById("chat");
  const entry = document.createElement("p");
  entry.innerHTML = `<b>${nome}:</b> ${msg}`;
  chat.appendChild(entry);
  chat.scrollTop = chat.scrollHeight;
});

socket.on("votacao", ({ jogadores }) => {
  votoSelecionado = null;
  mostrarVotacao(jogadores);
  document.getElementById("fase").innerText = "Fase: Votação";
  atualizarStatus("Vote no impostor! Clique em um jogador para marcar seu voto.");
});

socket.on("resultado", (data) => {
  const resultado = document.getElementById("resultado");
  const placar = data.jogadores
    .map((j) => `<li>${j.nome}: ${j.pontos} pontos</li>`)
    .join("");

  resultado.innerHTML = `
    <h3>Resultado</h3>
    <p>Impostor: <strong>${data.impostorNome || "-"}</strong></p>
    <p>Palavra secreta: <strong>${data.palavra || "-"}</strong></p>
    <p>Mais votado: <strong>${data.alvoNome || "-"}</strong></p>
    <p><strong>${data.acertaram === undefined ? "" : data.acertaram ? "Tripulação venceu!" : "Impostor venceu!"}</strong></p>
    <h4>Placar</h4>
    <ul>${placar}</ul>
  `;

  document.getElementById("votacao").innerHTML = "";
  document.getElementById("fase").innerText = data.final ? "Fase: Finalizado" : "Fase: Resultado";
  document.getElementById("chatArea").style.display = "none";

  const winnerText = data.vencedores ? data.vencedores.join(", ") : "sem vencedor";
  if (data.final) {
    atualizarStatus(`Partida encerrada. ${data.vencedores ? `Vencedor(es): ${winnerText}` : "Confira o placar final."}`);
  } else {
    atualizarStatus(data.acertaram ? "Tripulação venceu!" : "Impostor venceu!");
  }

  mostrarSala();
});

socket.on("reiniciar", () => {
  document.getElementById("votacao").innerHTML = "";
  document.getElementById("resultado").innerHTML = "";
  document.getElementById("palavra").innerText = "Aguardando início...";
  document.getElementById("fase").innerText = "Fase: Esperando jogadores";
  document.getElementById("turno").innerText = "";
  document.getElementById("chat").innerHTML = "";
  document.getElementById("chatArea").style.display = "block";
  document.getElementById("msg").value = "";
  document.getElementById("btnEnviar").disabled = true;
  document.getElementById("msg").disabled = true;
  atualizarStatus("A sala foi reiniciada. Aguarde o host iniciar a nova partida.");
});

socket.on("erro", (msg) => {
  alert(msg);
});

function enviar() {
  const msg = document.getElementById("msg").value.trim();
  if (!msg) return;
  socket.emit("mensagem", { codigo: codigoAtual, msg });
  document.getElementById("msg").value = "";
}

function iniciarJogo() {
  socket.emit("iniciarJogo", codigoAtual);
}

function continuarRodada() {
  socket.emit("continuarRodada", codigoAtual);
}

function encerrarJogo() {
  socket.emit("encerrarJogo", codigoAtual);
}

function reiniciarJogo() {
  socket.emit("reiniciarJogo", codigoAtual);
}

function votar(alvo) {
  socket.emit("votar", { codigo: codigoAtual, alvo });
}

function mostrarSala() {
  if (!salaInfo) return;
  document.getElementById("menu").style.display = "none";
  document.getElementById("game").style.display = "block";
  document.getElementById("codigoSala").innerText = `Sala: ${codigoAtual}`;
  document.getElementById("temaSala").innerText = salaInfo.tema ? `Tema: ${salaInfo.tema}` : "";
  document.getElementById("rodada").innerText = salaInfo.rodadaAtual
    ? `Rodada: ${salaInfo.rodadaAtual}`
    : "";
  document.getElementById("fase").innerText = salaInfo.etapa === "waiting"
    ? "Fase: Esperando jogadores"
    : salaInfo.etapa === "discussion"
    ? "Fase: Discussão"
    : salaInfo.etapa === "voting"
    ? "Fase: Votação"
    : salaInfo.etapa === "round_result"
    ? "Fase: Resultado"
    : "Fase: Finalizado";

  document.getElementById("listaJogadores").innerHTML = salaInfo.jogadores
    .map((j) => `<li>${j.nome} ${j.id === salaInfo.host ? "<span class=hostTag>(Host)</span>" : ""}</li>`)
    .join("");

  document.getElementById("placar").innerHTML = salaInfo.jogadores
    .map((j) => `<li>${j.nome}: ${j.pontos || 0} pontos</li>`)
    .join("");

  const hostActions = document.getElementById("hostActions");
  const themeChange = document.getElementById("themeChange");
  const isHost = salaInfo.host === meuId;
  if (isHost && (salaInfo.etapa === "waiting" || salaInfo.etapa === "round_result")) {
    themeChange.innerHTML = `
      <div class="theme-change-box">
        <label for="temaGame">Tema da próxima partida</label>
        <select id="temaGame" class="small-select">
          <option value="animais">Animais</option>
          <option value="comida">Comida</option>
          <option value="profissao">Profissão</option>
          <option value="lugares">Lugares</option>
        </select>
        <button onclick="atualizarTema()">Mudar tema</button>
      </div>
    `;
    document.getElementById("temaGame").value = salaInfo.tema || "animais";
  } else {
    themeChange.innerHTML = "";
  }

  if (isHost && salaInfo.etapa === "waiting") {
    hostActions.innerHTML = `<button onclick="iniciarJogo()">Iniciar jogo</button>`;
  } else if (isHost && salaInfo.etapa === "round_result") {
    hostActions.innerHTML = `
      <button onclick="continuarRodada()">Continuar rodada</button>
      <button onclick="encerrarJogo()">Encerrar jogo</button>
    `;
  } else if (isHost && salaInfo.etapa === "ended") {
    hostActions.innerHTML = `<button onclick="reiniciarJogo()">Reiniciar jogo</button>`;
  } else {
    hostActions.innerHTML = "";
  }

  const enviarButton = document.getElementById("btnEnviar");
  const inputMsg = document.getElementById("msg");
  if (salaInfo.etapa === "discussion") {
    const vezAtual = salaInfo.vez >= 0 ? salaInfo.jogadores[salaInfo.vez % salaInfo.jogadores.length]?.id : null;
    const podeFalar = vezAtual === meuId;
    enviarButton.disabled = !podeFalar;
    inputMsg.disabled = !podeFalar;
    inputMsg.placeholder = podeFalar ? "Digite sua mensagem" : "Aguarde sua vez de falar...";
  } else {
    enviarButton.disabled = true;
    inputMsg.disabled = true;
    inputMsg.placeholder = "Aguardando próxima fase...";
  }

  if (salaInfo.etapa === "waiting") {
    document.getElementById("palavra").innerText = "Aguardando início...";
  }
}

function mostrarVotacao(jogadores) {
  const votoDiv = document.getElementById("votacao");
  votoSelecionado = null;
  votoDiv.innerHTML = `<h3>Vote no impostor</h3><div class="votos">${jogadores
    .filter((j) => j.id !== meuId)
    .map((j) => `<button class="vote-button" onclick="selecionarVoto('${j.id}')" id="vote-${j.id}">${j.nome}</button>`)
    .join("")}</div>`;
}

function selecionarVoto(alvo) {
  votoSelecionado = alvo;
  const botoes = document.querySelectorAll(".vote-button");
  botoes.forEach((botao) => {
    botao.disabled = true;
    botao.classList.toggle("selected", botao.id === `vote-${alvo}`);
  });
  socket.emit("votar", { codigo: codigoAtual, alvo });
}

function atualizarStatus(text) {
  let status = document.getElementById("statusText");
  if (!status) {
    status = document.createElement("p");
    status.id = "statusText";
    document.querySelector("#game").prepend(status);
  }
  status.innerText = text;
}
