# 💻 C++ Online Compiler

Um compilador online de C++ desenvolvido com **React + Vite**, utilizando a API pública do Wandbox para compilar e executar códigos diretamente no navegador.

## 🚀 Sobre o Projeto

Este projeto foi criado com o objetivo de fornecer uma interface simples e funcional para escrever, compilar e executar códigos em C++ diretamente no browser.

A aplicação permite que o usuário:
- Escreva código C++ em um editor moderno
- Execute o código com um clique
- Visualize a saída no console integrado

## 🛠️ Tecnologias Utilizadas

- **React** — Biblioteca para construção da interface
- **Vite** — Ferramenta de build rápida e moderna
- **TypeScript** — Tipagem estática
- **Monaco Editor** — Editor de código (o mesmo do VS Code)
- **Tailwind CSS** — Estilização
- **React Query** — Gerenciamento de estado assíncrono
- **Wandbox API** — Compilação e execução de código C++

## 🎨 Interface

A interface do projeto foi construída com o auxílio da plataforma **Lovable**, que ajudou na criação de uma UI moderna e organizada.

## 📦 Instalação e Execução

Clone o repositório:

```bash
git clone https://github.com/seu-usuario/seu-repo.git
```

Acesse a pasta do projeto:

```bash
cd c_compiler
```

Instale as dependências:

```bash
npm install
```

Execute o projeto:

```bash
npm run dev
```

## 📜 Scripts Disponíveis

- `npm run dev` — Inicia o servidor de desenvolvimento
- `npm run build` — Gera a build de produção
- `npm run preview` — Visualiza a build
- `npm run lint` — Executa o linter
- `npm run test` — Executa testes com Vitest

## ⚙️ Como Funciona

O projeto utiliza a API:

https://wandbox.org/api/compile.json

Ela é responsável por:
- Compilar o código C++
- Executar o código remotamente
- Retornar a saída para exibição no console da aplicação

## 🔮 Futuro do Projeto

Este projeto é apenas uma **base inicial**. Futuramente, será implementado:

- 🔧 Backend próprio com **Node.js**
- 🐳 Uso de **Docker** para compilação isolada e segura
- ⚡ Melhor controle sobre execução e performance
- 🔒 Maior segurança no processamento dos códigos

## 📌 Objetivo

Evoluir de um compilador baseado em API externa para uma solução completa, com infraestrutura própria e maior controle sobre o ambiente de execução.

---

Feito para aprendizado e evolução contínua.
