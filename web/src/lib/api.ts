// A small typed client for the existing TurboFex backend. It only reads; the old pages keep doing the writing until their stage.
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export interface Health {
  ok: boolean;
  version: string;
  sessionMinutes: number;
}

export async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { credentials: 'same-origin', headers: { Accept: 'application/json' }, ...init });
  } catch {
    throw new ApiError(0, 'Could not reach the server');
  }
  if (!res.ok) throw new ApiError(res.status, `The server answered ${res.status}`);
  try {
    return (await res.json()) as T;
  } catch {
    throw new ApiError(res.status, 'The server sent something unexpected');
  }
}

export const api = {
  health: () => getJson<Health>('/health'),
};
