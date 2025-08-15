import type { ChatMessage, ChatSession } from "../types/ollama";
import { dbService } from "../services/database";

export const exportSessionsHandler = async (messages: ChatMessage[]) => {
  try {
    // Use database service for file operations if in Electron
    if (typeof window !== "undefined" && window.electronAPI) {
      await dbService.exportToFile();
      return;
    }

    // Fallback to browser download for development
    const exportData = await dbService.exportSessions();
    if (messages.length > 0) {
      (exportData as Record<string, unknown>).currentMessages = messages;
    }

    const dataStr = JSON.stringify(exportData, null, 2);
    const dataBlob = new Blob([dataStr], { type: "application/json" });

    const link = document.createElement("a");
    link.href = URL.createObjectURL(dataBlob);
    link.download = `chaichat-export-${
      new Date().toISOString().split("T")[0]
    }.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  } catch (error) {
    console.error("Failed to export sessions:", error);
  }
};

export const importSessionsHandler = async (
  file: File | undefined,
  messages: ChatMessage[],
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
  setSessions: React.Dispatch<React.SetStateAction<ChatSession[]>>
): Promise<boolean> => {
  try {
    // Use database service for file operations if in Electron and no file provided
    if (!file && typeof window !== "undefined" && window.electronAPI) {
      const importedCount = await dbService.importFromFile();
      if (importedCount > 0) {
        // Reload sessions from database
        const dbSessions = await dbService.getAllSessions();
        setSessions(dbSessions);
      }
      return importedCount > 0;
    }

    // Handle file-based import (for development or when file is provided)
    if (!file) {
      throw new Error("No file provided for import");
    }

    return new Promise<boolean>((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = async (e) => {
        try {
          const content = e.target?.result as string;
          const importData = JSON.parse(content);

          // Use database service to import
          const importedCount = await dbService.importSessions(importData);

          if (importedCount > 0) {
            // Reload sessions from database
            const dbSessions = await dbService.getAllSessions();
            setSessions(dbSessions);
          }

          // Optionally restore current messages if they exist and current chat is empty
          if (importData.currentMessages && messages.length === 0) {
            const revivedMessages = (
              importData.currentMessages as ChatMessage[]
            ).map((msg) => ({
              ...msg,
              timestamp: new Date(msg.timestamp),
            }));
            setMessages(revivedMessages);
          }

          resolve(importedCount > 0);
        } catch (err) {
          reject(
            new Error(
              `Failed to import sessions: ${
                err instanceof Error ? err.message : "Unknown error"
              }`
            )
          );
        }
      };

      reader.onerror = () => {
        reject(new Error("Failed to read import file"));
      };

      reader.readAsText(file);
    });
  } catch (error) {
    console.error("Import failed:", error);
    throw error;
  }
};

export const exportSessionHandler = (
  sessionId: string,
  sessions: ChatSession[]
) => {
  const session = sessions.find((s) => s.id === sessionId);
  if (!session) return;

  const exportData = {
    version: "1.0",
    exportDate: new Date().toISOString(),
    session: session,
  };

  const dataStr = JSON.stringify(exportData, null, 2);
  const dataBlob = new Blob([dataStr], { type: "application/json" });

  const link = document.createElement("a");
  link.href = URL.createObjectURL(dataBlob);
  link.download = `chaichat-session-${session.title.replace(
    /[^a-zA-Z0-9]/g,
    "-"
  )}-${new Date().toISOString().split("T")[0]}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
};
