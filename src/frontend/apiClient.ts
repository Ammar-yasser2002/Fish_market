export interface BackendHealth {
  status: string;
  timestamp: number;
  server: string;
  database: {
    type: string;
    file?: string;
    fileSize?: string;
    journalMode?: string;
    status: string;
    isLocal: boolean;
    counts?: {
      transactions: number;
      contacts: number;
      fishTypes: number;
      cashEntries: number;
      cashClosings: number;
    };
    features: string[];
  };
}

export async function checkBackendHealth(): Promise<BackendHealth | null> {
  try {
    const res = await fetch('/api/health');
    if (!res.ok) throw new Error('Failed to fetch backend health');
    return await res.json();
  } catch (err) {
    console.warn('Backend server is starting or unreachable directly:', err);
    return null;
  }
}

export async function getSystemInfo(): Promise<any> {
  try {
    const res = await fetch('/api/system-info');
    if (!res.ok) throw new Error('Failed to fetch system info');
    return await res.json();
  } catch (err) {
    return null;
  }
}
