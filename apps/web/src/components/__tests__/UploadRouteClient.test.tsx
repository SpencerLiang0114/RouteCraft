import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UploadRouteClient } from "../UploadRouteClient";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { push, setResults } = vi.hoisted(() => ({
  push: vi.fn(),
  setResults: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("@/lib/gpxParser", () => ({
  parseGpxRoute: vi.fn((text: string, name: string) => ({ id: name, name: text })),
}));

vi.mock("@/lib/kmlParser", () => ({
  parseKmlRoute: vi.fn(),
}));

vi.mock("@/store/routeStore", () => ({
  useRouteStore: (selector: (state: { setResults: typeof setResults }) => unknown) =>
    selector({ setResults }),
}));

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

function file(name: string, text: Deferred<string>): File {
  return Object.assign(new File([""], name, { type: "application/gpx+xml" }), {
    text: () => text.promise,
  });
}

async function selectFile(input: HTMLInputElement, selectedFile: File) {
  await act(async () => {
    Object.defineProperty(input, "files", { configurable: true, value: [selectedFile] });
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

describe("UploadRouteClient", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    push.mockReset();
    setResults.mockReset();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("ignores an older file success and finally after a newer file is selected", async () => {
    const oldText = deferred<string>();
    const newText = deferred<string>();
    const oldFile = file("old.gpx", oldText);
    const newFile = file("new.gpx", newText);

    await act(async () => root.render(<StrictMode><UploadRouteClient /></StrictMode>));
    const input = container.querySelector<HTMLInputElement>("input[type=file]")!;
    await selectFile(input, oldFile);
    await selectFile(input, newFile);

    await act(async () => oldText.resolve("old route"));

    expect(setResults).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    expect(container.textContent).toContain("new.gpx");
    expect(container.textContent).toContain("Parsing…");

    await act(async () => newText.resolve("new route"));

    expect(setResults).toHaveBeenCalledWith([{ id: "new", name: "new route" }], "new");
    expect(push).toHaveBeenCalledWith("/results");
    expect(container.textContent).not.toContain("Parsing route…");
  });

  it("ignores an older file error and finally while the newer file is parsing", async () => {
    const oldText = deferred<string>();
    const newText = deferred<string>();

    await act(async () => root.render(<StrictMode><UploadRouteClient /></StrictMode>));
    const input = container.querySelector<HTMLInputElement>("input[type=file]")!;
    await selectFile(input, file("old.gpx", oldText));
    await selectFile(input, file("new.gpx", newText));

    await act(async () => oldText.reject(new Error("old file failed")));

    expect(container.textContent).not.toContain("old file failed");
    expect(container.textContent).toContain("Parsing route…");
    expect(setResults).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("does not update state or navigate after unmounting during parsing", async () => {
    const pending = deferred<string>();

    await act(async () => root.render(<StrictMode><UploadRouteClient /></StrictMode>));
    const input = container.querySelector<HTMLInputElement>("input[type=file]")!;
    await selectFile(input, file("route.gpx", pending));

    await act(async () => root.unmount());
    await act(async () => pending.resolve("route"));

    expect(setResults).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });
});
