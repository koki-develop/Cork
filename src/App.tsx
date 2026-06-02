import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";

function App() {
  const [greetMsg, setGreetMsg] = useState("");
  const [name, setName] = useState("");

  async function greet() {
    // Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
    setGreetMsg(await invoke("greet", { name }));
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-900 text-white">
      <h1 className="text-4xl font-bold">Welcome to Tauri + React</h1>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          greet();
        }}
        className="flex gap-2"
      >
        <input
          id="greet-input"
          onChange={(e) => setName(e.currentTarget.value)}
          placeholder="Enter a name..."
          className="rounded border border-gray-600 bg-gray-800 px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          className="rounded bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-500 transition-colors"
        >
          Greet
        </button>
      </form>
      <p className="text-lg text-gray-300">{greetMsg}</p>
    </main>
  );
}

export default App;
