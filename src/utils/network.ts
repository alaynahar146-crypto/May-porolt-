export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = 30000
): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("انتهت مهلة الاتصال بسبب بطء الشبكة. تحقق من الإنترنت وأعد المحاولة.");
    }
    throw new Error("تعذر الاتصال بالخادم. تحقق من اتصالك بالإنترنت وحاول مجدداً.");
  } finally {
    window.clearTimeout(timer);
  }
}
