interface PagesFunctionContext {
  request: Request;
  params: {
    path: string[];
  };
}

const SCORE_SABER_ORIGIN = "https://scoresaber.com";
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
    path.length < 3 ||
    path[0] !== "api" ||
    path[1] !== "v2" ||
    path.some((segment) => segment === "." || segment === "..")
  ) {
    return new Response("Not found", { status: 404 });
  }

  const upstreamUrl = new URL(
    `/${path.map((segment) => encodeURIComponent(segment)).join("/")}`,
    SCORE_SABER_ORIGIN,
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
