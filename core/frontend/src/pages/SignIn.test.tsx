import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SignIn } from "./SignIn";

type Route = {
  status?: number;
  body: unknown;
  headers?: Record<string, string>;
};

function routes(table: Record<string, Route>) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: RequestInit) => {
      calls.push({ url, init });
      const route = table[`${init?.method ?? "GET"} ${url}`];
      if (!route) return Promise.reject(new Error(`no route for ${url}`));
      const status = route.status ?? 200;
      return Promise.resolve({
        ok: status < 400,
        status,
        headers: new Headers(route.headers ?? {}),
        json: () => Promise.resolve(route.body),
      });
    }),
  );
  return calls;
}

const REQUEST = "?request=req123";
const INFO = { app: { key: "books", name: "Rooman Books" }, signedIn: false };
const ORGS = [
  { id: "o1", name: "Alpha Traders", code: "alpha", role: "admin" },
  { id: "o2", name: "Beta Clinic", code: "beta", role: "staff" },
];
const assign = vi.fn();
const realLocation = window.location;

beforeEach(() => {
  assign.mockReset();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...realLocation, assign },
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: realLocation,
  });
});

describe("Sign-in without an app request", () => {
  it("explains how to sign in and reports a healthy service", async () => {
    routes({ "GET /api/health": { body: { status: "healthy" } } });
    render(<SignIn search="" />);
    expect(
      screen.getByRole("heading", { name: "Sign in" }),
    ).toBeInTheDocument();
    expect(await screen.findByLabelText("Email")).toBeInTheDocument();
    expect(
      await screen.findByText("The identity service is running."),
    ).toBeInTheDocument();
  });

  it("shows a reference id when the database is down", async () => {
    routes({
      "GET /api/health": {
        body: { status: "degraded" },
        headers: { "X-Request-ID": "abc123" },
      },
    });
    render(<SignIn search="" />);
    expect(
      await screen.findByText(/database is not reachable/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Reference: abc123/)).toBeInTheDocument();
  });

  it("explains what to do when the service cannot be reached", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("offline"))),
    );
    render(<SignIn search="" />);
    expect(await screen.findByText(/cannot be reached/)).toBeInTheDocument();
  });

  it("confirms a sign-out", () => {
    routes({ "GET /api/health": { body: { status: "healthy" } } });
    render(<SignIn search="?signed_out=1" />);
    expect(
      screen.getByText(/signed out of every Rooman app/),
    ).toBeInTheDocument();
  });
});

describe("Sign-in for an app", () => {
  const fill = async () => {
    await screen.findByText("to continue to Rooman Books");
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: " ravi@acme.test " },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "Str0ngPass!" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  };

  it("signs in and returns to the app", async () => {
    const calls = routes({
      "GET /api/oauth/requests/req123": { body: INFO },
      "POST /api/oauth/login": {
        body: { redirect: "https://books.test/auth/callback?code=c1&state=s" },
      },
    });
    render(<SignIn search={REQUEST} />);
    await fill();
    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith(
        "https://books.test/auth/callback?code=c1&state=s",
      ),
    );
    const login = calls.find((c) => c.url === "/api/oauth/login");
    expect(JSON.parse(String(login?.init?.body))).toEqual({
      request_id: "req123",
      email: "ravi@acme.test",
      password: "Str0ngPass!",
    });
    expect(
      (login?.init?.headers as Record<string, string>)["X-Rooman-Signin"],
    ).toBe("1");
  });

  it("shows the reason a sign-in failed and clears the password", async () => {
    routes({
      "GET /api/oauth/requests/req123": { body: INFO },
      "POST /api/oauth/login": {
        status: 401,
        body: {
          code: "invalid_credentials",
          detail: "Wrong email or password.",
        },
      },
    });
    render(<SignIn search={REQUEST} />);
    await fill();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Wrong email or password.",
    );
    expect(screen.getByLabelText("Password")).toHaveValue("");
    expect(assign).not.toHaveBeenCalled();
  });

  it("lets someone in several organizations choose one", async () => {
    const calls = routes({
      "GET /api/oauth/requests/req123": { body: INFO },
      "POST /api/oauth/login": { body: { chooseOrganization: ORGS } },
      "POST /api/oauth/choose-org": {
        body: { redirect: "https://books.test/cb?code=c2" },
      },
    });
    render(<SignIn search={REQUEST} />);
    await fill();
    fireEvent.click(await screen.findByRole("button", { name: /Beta Clinic/ }));
    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith("https://books.test/cb?code=c2"),
    );
    const choose = calls.find((c) => c.url === "/api/oauth/choose-org");
    expect(JSON.parse(String(choose?.init?.body))).toEqual({
      request_id: "req123",
      org_id: "o2",
    });
  });

  it("goes straight to the organization choice when already signed in", async () => {
    routes({
      "GET /api/oauth/requests/req123": {
        body: { ...INFO, signedIn: true, organizations: ORGS },
      },
    });
    render(<SignIn search={REQUEST} />);
    expect(
      await screen.findByRole("heading", { name: "Choose an organization" }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
  });

  it("explains an expired link", async () => {
    routes({
      "GET /api/oauth/requests/req123": {
        status: 400,
        body: {
          detail:
            "This sign-in link has expired. Go back to the app and sign in again.",
        },
      },
    });
    render(<SignIn search={REQUEST} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("has expired");
  });

  it("explains when Core cannot be reached", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("offline"))),
    );
    render(<SignIn search={REQUEST} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "not available right now",
    );
  });
});

describe("Rooman One own page", () => {
  const ME = {
    signedIn: true,
    user: { email: "ravi@acme.test", name: "Ravi Kumar" },
    apps: [
      {
        key: "books",
        name: "Rooman Books",
        url: "https://books.test/api/auth/rooman-one/start",
        organizations: ["Acme Traders"],
      },
    ],
  };

  it("signs in here and then lists the apps to open", async () => {
    const calls = routes({
      "GET /api/health": { body: { status: "healthy" } },
      "GET /api/oauth/me": { body: { signedIn: false } },
      "POST /api/oauth/login": { body: ME },
    });
    render(<SignIn search="" />);
    fireEvent.change(await screen.findByLabelText("Email"), {
      target: { value: "ravi@acme.test" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "Str0ngPass!" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    const open = await screen.findByRole("link", { name: /Open Rooman Books/ });
    expect(open).toHaveAttribute(
      "href",
      "https://books.test/api/auth/rooman-one/start",
    );
    const login = calls.find((c) => c.url === "/api/oauth/login");
    expect(JSON.parse(String(login?.init?.body))).toEqual({
      email: "ravi@acme.test",
      password: "Str0ngPass!",
    });
    expect(
      (login?.init?.headers as Record<string, string>)["X-Rooman-Signin"],
    ).toBe("1");
  });

  it("goes straight to the apps when already signed in", async () => {
    routes({
      "GET /api/health": { body: { status: "healthy" } },
      "GET /api/oauth/me": { body: ME },
    });
    render(<SignIn search="" />);
    expect(
      await screen.findByRole("link", { name: /Open Rooman Books/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign out" })).toHaveAttribute(
      "href",
      "/api/oauth/logout",
    );
    expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
  });

  it("shows the reason a sign-in failed", async () => {
    routes({
      "GET /api/health": { body: { status: "healthy" } },
      "GET /api/oauth/me": { body: { signedIn: false } },
      "POST /api/oauth/login": {
        status: 401,
        body: { detail: "Wrong email or password." },
      },
    });
    render(<SignIn search="" />);
    fireEvent.change(await screen.findByLabelText("Email"), {
      target: { value: "ravi@acme.test" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "nope" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(
      await screen.findByText("Wrong email or password."),
    ).toBeInTheDocument();
  });

  it("says so when no apps are switched on", async () => {
    routes({
      "GET /api/health": { body: { status: "healthy" } },
      "GET /api/oauth/me": { body: { ...ME, apps: [] } },
    });
    render(<SignIn search="" />);
    expect(
      await screen.findByText(/No apps are switched on/),
    ).toBeInTheDocument();
  });
});

describe("Create an organization", () => {
  const ME = {
    signedIn: true,
    user: { email: "asha@newco.test", name: "Asha Rao" },
    apps: [
      {
        key: "books",
        name: "Rooman Books",
        url: "https://books.test/start",
        organizations: ["NewCo Traders"],
      },
    ],
  };

  it("takes the details, then the emailed code, then lists the apps", async () => {
    const calls = routes({
      "GET /api/health": { body: { status: "healthy" } },
      "GET /api/oauth/me": { body: { signedIn: false, signupAllowed: true } },
      "POST /api/oauth/signup": {
        body: { ticket: "tkt", email: "asha@newco.test" },
      },
      "POST /api/oauth/signup/confirm": { body: ME },
    });
    render(<SignIn search="" />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Create an organization" }),
    );
    fireEvent.change(screen.getByLabelText("Your name"), {
      target: { value: "Asha Rao" },
    });
    fireEvent.change(screen.getByLabelText("Organization name"), {
      target: { value: "NewCo Traders" },
    });
    fireEvent.change(screen.getByLabelText("Work email"), {
      target: { value: "asha@newco.test" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "Str0ngPass!" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    fireEvent.change(await screen.findByLabelText("Verification code"), {
      target: { value: "12a3456" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Create organization" }),
    );
    expect(
      await screen.findByRole("link", { name: /Open Rooman Books/ }),
    ).toBeInTheDocument();

    const confirm = calls.find((c) => c.url === "/api/oauth/signup/confirm");
    expect(JSON.parse(String(confirm?.init?.body))).toEqual({
      ticket: "tkt",
      code: "123456",
    });
  });

  it("is not offered when sign-up is closed", async () => {
    routes({
      "GET /api/health": { body: { status: "healthy" } },
      "GET /api/oauth/me": { body: { signedIn: false, signupAllowed: false } },
    });
    render(<SignIn search="" />);
    await screen.findByLabelText("Email");
    expect(
      screen.queryByRole("button", { name: "Create an organization" }),
    ).not.toBeInTheDocument();
  });

  it("shows why the details were refused", async () => {
    routes({
      "GET /api/health": { body: { status: "healthy" } },
      "GET /api/oauth/me": { body: { signedIn: false, signupAllowed: true } },
      "POST /api/oauth/signup": {
        status: 409,
        body: {
          detail: "An account with this email already exists. Sign in instead.",
        },
      },
    });
    render(<SignIn search="" />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Create an organization" }),
    );
    fireEvent.change(screen.getByLabelText("Your name"), {
      target: { value: "Asha Rao" },
    });
    fireEvent.change(screen.getByLabelText("Organization name"), {
      target: { value: "NewCo" },
    });
    fireEvent.change(screen.getByLabelText("Work email"), {
      target: { value: "asha@newco.test" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "Str0ngPass!" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText(/already exists/)).toBeInTheDocument();
  });
});
