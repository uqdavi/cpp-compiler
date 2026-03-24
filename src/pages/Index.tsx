// Importação dos hooks do React e tipos necessários
import { useState, useCallback, useRef, KeyboardEvent, useEffect } from "react";

// Editor de código (Monaco - o mesmo do VS Code)
import Editor from "@monaco-editor/react";

// Ícones usados na interface
import { Play, Terminal, Loader2, Clock, RotateCcw, Code } from "lucide-react";

// Código padrão que aparece no editor
const DEFAULT_CODE = `#include <iostream>

using namespace std;
int main() {
    cout << "Hello, World!";

    return 0;
}`;

// Interface que define o formato da resposta da API Wandbox
interface WandboxResponse {
  program_output?: string;     // Saída do programa
  compiler_output?: string;    // Saída do compilador
  compiler_error?: string;     // Erro de compilação
  program_error?: string;      // Erro em tempo de execução
  status?: string;
  signal?: string;
}

// Função que tenta extrair mensagens (cout) antes de um cin
function extractPromptsBeforeCin(code: string): string[] {
  const prompts: string[] = [];
  const lines = code.split("\n"); // Divide o código em linhas

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Verifica se a linha contém entrada de dados (cin, getline ou scanf)
    if (/cin\s*>>/.test(line) || /getline\s*\(\s*cin/.test(line) || /scanf\s*\(/.test(line)) {
      let prompt = "";

      // Procura nas linhas anteriores um cout (até 5 linhas acima)
      for (let j = i - 1; j >= Math.max(0, i - 5); j--) {
        const prev = lines[j].trim();

        // Regex para pegar texto dentro de cout << "..."
        const coutMatch = prev.match(/cout\s*<<\s*"([^"]*)"/);
        if (coutMatch) {
          prompt = coutMatch[1];
          break;
        }
      }

      // Também verifica se cout e cin estão na mesma linha
      const sameLineMatch = line.match(/cout\s*<<\s*"([^"]*)"/);
      if (sameLineMatch) {
        prompt = sameLineMatch[1];
      }

      prompts.push(prompt);
    }
  }

  return prompts;
}

// Conta quantas entradas (cin, getline, scanf) existem no código
function countCinReads(code: string): number {
  const cinOps = (code.match(/cin\s*>>/g) || []).length;
  const getlines = (code.match(/getline\s*\(\s*cin/g) || []).length;
  const scanfs = (code.match(/scanf\s*\(/g) || []).length;

  return cinOps + getlines + scanfs;
}

// Tipos possíveis de entrada no console
type ConsoleEntry =
  | { type: "output"; text: string } // saída normal
  | { type: "input"; text: string }  // entrada do usuário
  | { type: "error"; text: string }  // erro
  | { type: "prompt"; text: string };// mensagem antes do input

// Componente principal
const Index = () => {

  // Estados principais
  const [code, setCode] = useState(DEFAULT_CODE); // código no editor
  const [currentInput, setCurrentInput] = useState(""); // input atual
  const [consoleEntries, setConsoleEntries] = useState<ConsoleEntry[]>([]); // console
  const [isRunning, setIsRunning] = useState(false); // se está executando
  const [waitingForInput, setWaitingForInput] = useState(false); // esperando input
  const [executionTime, setExecutionTime] = useState<number | null>(null); // tempo execução

  // Referências para elementos do DOM
  const consoleRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Armazena inputs e controle de quantidade
  const collectedInputsRef = useRef<string[]>([]);
  const expectedCountRef = useRef(0);
  const promptsRef = useRef<string[]>([]);

  // Função para rolar o console até o final
  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      consoleRef.current?.scrollTo(0, consoleRef.current.scrollHeight);
    }, 30);
  }, []);

  // Função que chama a API da Wandbox para compilar/executar
  const executeCode = useCallback(async (stdinText: string): Promise<WandboxResponse> => {
    const response = await fetch("https://wandbox.org/api/compile.json", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        compiler: "gcc-head",
        options: "warning,gnu++2b",
        stdin: stdinText, // entradas do usuário
      }),
    });

    if (!response.ok) {
      throw new Error(`Erro na API: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }, [code]);

  // Mostra o próximo prompt (ex: "Digite um número:")
  const showNextPrompt = useCallback((inputIndex: number) => {
    const prompts = promptsRef.current;

    if (inputIndex < prompts.length && prompts[inputIndex]) {
      setConsoleEntries((prev) => [
        ...prev,
        { type: "prompt", text: prompts[inputIndex] },
      ]);
    }

    setWaitingForInput(true);
    scrollToBottom();
  }, [scrollToBottom]);

  // Executa o código depois de coletar todos inputs
  const finalExecute = useCallback(async (allInputs: string[]) => {
    setIsRunning(true);
    setWaitingForInput(false);

    const startTime = performance.now();

    try {
      const data = await executeCode(allInputs.join("\n"));
        console.log("Resposta bruta da API Wandbox:", data);

      const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
      setExecutionTime(parseFloat(elapsed));

      const newEntries: ConsoleEntry[] = [];

      if (data.compiler_error) {
        newEntries.push({ type: "error", text: data.compiler_error });
      } else {
        if (data.program_output) {
          newEntries.push({ type: "output", text: data.program_output });
        }
      }

      if (data.program_error) newEntries.push({ type: "error", text: data.program_error });
      if (data.signal) newEntries.push({ type: "error", text: `[SINAL: ${data.signal}]` });

      if (newEntries.length === 0) {
        newEntries.push({ type: "output", text: "Programa executado sem saída." });
      }

      setConsoleEntries(newEntries);
    } catch (err) {
      setConsoleEntries((prev) => [
        ...prev,
        { type: "error", text: err instanceof Error ? err.message : "Erro na API" },
      ]);
    } finally {
      setIsRunning(false);
      scrollToBottom();
    }
  }, [executeCode, scrollToBottom]);

  // Função chamada ao clicar em RUN
  const runCode = useCallback(() => {
    const expected = countCinReads(code); // quantos inputs
    const prompts = extractPromptsBeforeCin(code); // mensagens

    // Reset geral
    setConsoleEntries([]);
    setExecutionTime(null);
    setCurrentInput("");
    collectedInputsRef.current = [];
    expectedCountRef.current = expected;
    promptsRef.current = prompts;

    // Se não tiver input → executa direto
    if (expected === 0) {
      setIsRunning(true);
      setWaitingForInput(false);

      const startTime = performance.now();

      executeCode("").then((data) => {
        const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
        setExecutionTime(parseFloat(elapsed));

        const entries: ConsoleEntry[] = [];

        if (data.compiler_error) entries.push({ type: "error", text: data.compiler_error });
        if (data.program_output) entries.push({ type: "output", text: data.program_output });

        if (entries.length === 0) {
          entries.push({ type: "output", text: "Sem saída." });
        }

        setConsoleEntries(entries);
        setIsRunning(false);
        scrollToBottom();
      });

    } else {
      // Se tiver input → inicia fluxo interativo
      showNextPrompt(0);
    }
  }, [code, executeCode, showNextPrompt, scrollToBottom]);

  // Quando usuário pressiona ENTER no terminal
  const handleTerminalKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && waitingForInput) {
      e.preventDefault();

      const value = currentInput;
      setCurrentInput("");

      // Adiciona input no console
      setConsoleEntries((prev) => [
        ...prev,
        { type: "input", text: value },
      ]);

      collectedInputsRef.current.push(value);

      const collected = collectedInputsRef.current.length;
      const expected = expectedCountRef.current;

      // Se já coletou tudo → executa
      if (collected >= expected) {
        finalExecute(collectedInputsRef.current);
      } else {
        // Senão → próximo prompt
        showNextPrompt(collected);
      }
    }
  };

  // Limpa o console
  const resetConsole = () => {
    setConsoleEntries([]);
    setWaitingForInput(false);
    setExecutionTime(null);
    setCurrentInput("");
    collectedInputsRef.current = [];
  };

  // Foca automaticamente no input
  useEffect(() => {
    if (waitingForInput) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [waitingForInput, consoleEntries]);

  // JSX (interface)
  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="flex items-center justify-between px-5 py-3 border-b border-border bg-card">
        <div className="flex items-center gap-2.5">
          <Terminal className="w-5 h-5 text-primary" />
          <h1 className="text-base font-semibold text-foreground tracking-tight">C++ Compiler</h1>
          <span className="text-xs text-muted-foreground font-mono ml-1 hidden md:block">Davis Developer</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-x-6">
              <span className="hidden md:flex items-center gap-1.5 text-xs text-muted-foreground font-mono">
                <Code className="w-4 h-4" />
                gcc 13.2.0
              </span>
            {executionTime !== null && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono">
                <Clock className="w-3.5 h-3.5" />
                {executionTime}s
              </span>
            )}
          </div>
          <button
            onClick={resetConsole}
            className="inline-flex items-center p-2 rounded-md text-muted-foreground hover:text-foreground transition-colors"
            title="Limpar console"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            onClick={runCode}
            disabled={isRunning}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium
              bg-primary text-primary-foreground
              hover:brightness-110 active:scale-[0.97]
              disabled:opacity-50 disabled:pointer-events-none
              transition-all duration-150 ease-out"
          >
            {isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
            {isRunning ? "Executando..." : "RUN"}
          </button>
        </div>
      </header>

      {/* Editor */}
      <div className="flex-1 min-h-0">
        <Editor
          height="100%"
          defaultLanguage="cpp"
          value={code}
          onChange={(v) => setCode(v ?? "")}
          theme="vs-dark"
          options={{
            fontSize: 14,
            fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            padding: { top: 16 },
            lineNumbersMinChars: 3,
            renderLineHighlight: "line",
            smoothScrolling: true,
            cursorBlinking: "smooth",
            bracketPairColorization: { enabled: true },
          }}
        />
      </div>

      {/* Console */}
      <div className="border-t border-border flex flex-col" style={{ height: "clamp(180px, 30vh, 320px)" }}>
        <div className="flex items-center gap-2 px-4 py-1.5 text-xs font-medium text-muted-foreground bg-card border-b border-border">
          <Terminal className="w-3.5 h-3.5" />
          Console
        </div>
        <div
          ref={consoleRef}
          className="flex-1 overflow-auto px-4 py-3 text-sm font-mono leading-relaxed"
          style={{ backgroundColor: "hsl(var(--console-bg))", color: "hsl(var(--console-text))" }}
          onClick={() => inputRef.current?.focus()}
        >
          {consoleEntries.map((entry, i) => (
            <div
              key={i}
              className={
                entry.type === "input"
                  ? "text-accent"
                  : entry.type === "error"
                  ? "text-destructive"
                  : entry.type === "prompt"
                  ? ""
                  : ""
              }
            >
              {entry.type === "input" && <span className="text-muted-foreground mr-1">&gt; </span>}
              <span className="whitespace-pre-wrap">{entry.text}</span>
            </div>
          ))}

          {isRunning && (
            <div className="text-muted-foreground animate-pulse">Compilando e executando...</div>
          )}

          {!waitingForInput && !isRunning && consoleEntries.length === 0 && (
            <span className="text-muted-foreground">
              Clique em RUN para compilar e executar seu código C++.
            </span>
          )}
        </div>

        {/* Terminal input line */}
        <div className={`flex items-center gap-2 px-4 py-2 border-t border-border bg-card`}>
          <span className={`text-sm font-mono ${waitingForInput ? "text-accent animate-pulse" : "text-muted-foreground"}`}>&gt;</span>
          <input
            ref={inputRef}
            type="text"
            value={currentInput}
            onChange={(e) => setCurrentInput(e.target.value)}
            onKeyDown={handleTerminalKeyDown}
            placeholder={waitingForInput ? "Digite e pressione Enter..." : "Clique RUN para iniciar"}
            className="flex-1 bg-transparent text-foreground text-sm font-mono focus:outline-none placeholder:text-muted-foreground"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
      </div>
    </div>
  );
};

export default Index;
