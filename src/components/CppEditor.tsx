import { useState, useCallback, useRef, KeyboardEvent, useEffect } from "react";
import Editor from "@monaco-editor/react";
import { Play, Terminal, Loader2, Clock, RotateCcw } from "lucide-react";

const DEFAULT_CODE = `#include <iostream>

using namespace std;
int main() {
    cout << "Hello, World!";

    return 0;
}`;

interface WandboxResponse {
  program_output?: string;
  compiler_output?: string;
  compiler_error?: string;
  program_error?: string;
  status?: string;
  signal?: string;
}

/**
 * Extract cout/prompt strings that appear immediately before each cin read.
 * Returns an array of prompt strings (one per cin).
 */
function extractPromptsBeforeCin(code: string): string[] {
  const prompts: string[] = [];
  const lines = code.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Check if this line has a cin read
    if (/cin\s*>>/.test(line) || /getline\s*\(\s*cin/.test(line) || /scanf\s*\(/.test(line)) {
      // Look backwards for the nearest cout
      let prompt = "";
      for (let j = i - 1; j >= Math.max(0, i - 5); j--) {
        const prev = lines[j].trim();
        // Match cout << "..." patterns and extract the string literals
        const coutMatch = prev.match(/cout\s*<<\s*"([^"]*)"/);
        if (coutMatch) {
          prompt = coutMatch[1];
          break;
        }
      }
      // Also check same line for patterns like: cout << "prompt"; cin >> x;
      const sameLineMatch = line.match(/cout\s*<<\s*"([^"]*)"/);
      if (sameLineMatch) {
        prompt = sameLineMatch[1];
      }
      prompts.push(prompt);
    }
  }

  return prompts;
}

function countCinReads(code: string): number {
  const cinOps = (code.match(/cin\s*>>/g) || []).length;
  const getlines = (code.match(/getline\s*\(\s*cin/g) || []).length;
  const scanfs = (code.match(/scanf\s*\(/g) || []).length;
  return cinOps + getlines + scanfs;
}

type ConsoleEntry =
  | { type: "output"; text: string }
  | { type: "input"; text: string }
  | { type: "error"; text: string }
  | { type: "prompt"; text: string };

const CppEditor = () => {
  const [code, setCode] = useState(DEFAULT_CODE);
  const [currentInput, setCurrentInput] = useState("");
  const [consoleEntries, setConsoleEntries] = useState<ConsoleEntry[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [waitingForInput, setWaitingForInput] = useState(false);
  const [executionTime, setExecutionTime] = useState<number | null>(null);
  const consoleRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Track accumulated stdin and how many inputs we still need
  const collectedInputsRef = useRef<string[]>([]);
  const expectedCountRef = useRef(0);
  const promptsRef = useRef<string[]>([]);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      consoleRef.current?.scrollTo(0, consoleRef.current.scrollHeight);
    }, 30);
  }, []);

  // Execute code with given stdin via Wandbox
  const executeCode = useCallback(async (stdinText: string): Promise<WandboxResponse> => {
    const response = await fetch("https://wandbox.org/api/compile.json", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        compiler: "gcc-head",
        options: "warning,gnu++2b",
        stdin: stdinText,
      }),
    });
    if (!response.ok) {
      throw new Error(`Erro na API: ${response.status} ${response.statusText}`);
    }
    return response.json();
  }, [code]);

  // Show the next cin prompt in the console
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

  // Final execution after all inputs collected
  const finalExecute = useCallback(async (allInputs: string[]) => {
    setIsRunning(true);
    setWaitingForInput(false);
    const startTime = performance.now();

    try {
      const data = await executeCode(allInputs.join("\n"));
      const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
      setExecutionTime(parseFloat(elapsed));

      // Replace the interactive entries with the real program output
      const newEntries: ConsoleEntry[] = [];

      if (data.compiler_error) {
        newEntries.push({ type: "error", text: data.compiler_error });
      } else {
        // Show the full program output (which includes prompts + responses)
        if (data.program_output) {
          newEntries.push({ type: "output", text: data.program_output });
        }
      }
      if (data.program_error) newEntries.push({ type: "error", text: data.program_error });
      if (data.signal) newEntries.push({ type: "error", text: `[SINAL: ${data.signal}]` });
      if (newEntries.length === 0) newEntries.push({ type: "output", text: "Programa executado sem saída." });

      setConsoleEntries(newEntries);
    } catch (err) {
      setConsoleEntries((prev) => [
        ...prev,
        { type: "error", text: err instanceof Error ? err.message : "Falha ao conectar com a API." },
      ]);
    } finally {
      setIsRunning(false);
      scrollToBottom();
    }
  }, [executeCode, scrollToBottom]);

  // RUN button: start the interactive flow
  const runCode = useCallback(() => {
    const expected = countCinReads(code);
    const prompts = extractPromptsBeforeCin(code);

    setConsoleEntries([]);
    setExecutionTime(null);
    setCurrentInput("");
    collectedInputsRef.current = [];
    expectedCountRef.current = expected;
    promptsRef.current = prompts;

    if (expected === 0) {
      // No cin reads — execute immediately
      setIsRunning(true);
      setWaitingForInput(false);
      const startTime = performance.now();
      executeCode("").then((data) => {
        const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
        setExecutionTime(parseFloat(elapsed));
        const entries: ConsoleEntry[] = [];
        if (data.compiler_error) entries.push({ type: "error", text: data.compiler_error });
        if (data.compiler_output) entries.push({ type: "output", text: data.compiler_output });
        if (data.program_output) entries.push({ type: "output", text: data.program_output });
        if (data.program_error) entries.push({ type: "error", text: data.program_error });
        if (data.signal) entries.push({ type: "error", text: `[SINAL: ${data.signal}]` });
        if (entries.length === 0) entries.push({ type: "output", text: "Programa executado sem saída." });
        setConsoleEntries(entries);
        setIsRunning(false);
        scrollToBottom();
      }).catch((err) => {
        setConsoleEntries([{ type: "error", text: err instanceof Error ? err.message : "Erro" }]);
        setIsRunning(false);
      });
    } else {
      // Has cin reads — show first prompt and wait
      showNextPrompt(0);
    }
  }, [code, executeCode, showNextPrompt, scrollToBottom]);

  // Handle Enter in terminal input
  const handleTerminalKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && waitingForInput) {
      e.preventDefault();
      const value = currentInput;
      setCurrentInput("");

      // Add user input to console
      setConsoleEntries((prev) => [
        ...prev,
        { type: "input", text: value },
      ]);

      collectedInputsRef.current.push(value);
      const collected = collectedInputsRef.current.length;
      const expected = expectedCountRef.current;

      if (collected >= expected) {
        // All inputs gathered — execute
        finalExecute(collectedInputsRef.current);
      } else {
        // Show next prompt
        showNextPrompt(collected);
      }
    }
  };

  const resetConsole = () => {
    setConsoleEntries([]);
    setWaitingForInput(false);
    setExecutionTime(null);
    setCurrentInput("");
    collectedInputsRef.current = [];
  };

  // Auto-focus when waiting for input
  useEffect(() => {
    if (waitingForInput) {
      // Small delay to ensure DOM is ready
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [waitingForInput, consoleEntries]);

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="flex items-center justify-between px-5 py-3 border-b border-border bg-card">
        <div className="flex items-center gap-2.5">
          <Terminal className="w-5 h-5 text-primary" />
          <h1 className="text-base font-semibold text-foreground tracking-tight">C++ Editor</h1>
          <span className="text-xs text-muted-foreground font-mono ml-1">gcc-head</span>
        </div>
        <div className="flex items-center gap-3">
          {executionTime !== null && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono">
              <Clock className="w-3.5 h-3.5" />
              {executionTime}s
            </span>
          )}
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

export default CppEditor;
