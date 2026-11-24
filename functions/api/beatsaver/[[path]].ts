interface PagesFunctionContext {
  request: Request;
  params: {
    path: string[];
  };
}

const BEATSAVER_ORIGIN = "https://api.beatsaver.com";
const RESPONSE_HEADERS_TO_FORWARD = [
  "cache-control",
  "content-type",
  "etag",
  "last-modified",
  "retry-after",
];

export const onRequestGet = async ({
  request,
  params,
}: PagesFunctionContext): Promise<Response> => {
  const { path } = params;
  if (
    path.length < 2 ||
    path[0] !== "api" ||
    path[1] !== "beatsaver" ||
    path.some((segment) => segment === "." || segment === "..")
  ) {
    return new Response("Not found", { status: 404 });
  }

  const upstreamPath = path.slice(2);
  if (upstreamPath.length === 0) {
    return new Response("Not found", { status: 404 });
  }

  const upstreamUrl = new URL(
    `/${upstreamPath.map((segment) => encodeURIComponent(segment)).join("/")}`,
    BEATSAVER_ORIGIN,
  );
  upstreamUrl.search = new URL(request.url).search;

  const upstream = await fetch(upstreamUrl, {
    headers: {
      Accept: request.headers.get("Accept") ?? "application/json",
    },
    signal: request.signal,
  });

  const headers = new Headers();
  for (const name of RESPONSE_HEADERS_TO_FORWARD) {
    const value = upstream.headers.get(name);
    if (value !== null) headers.set(name, value);
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
};
