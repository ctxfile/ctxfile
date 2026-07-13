import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Without vitest globals, RTL can't self-register its cleanup hook.
afterEach(cleanup);
