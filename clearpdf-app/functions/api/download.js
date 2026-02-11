export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    const key = url.searchParams.get("key");

    if (!key) {
        return new Response("Missing key", { status: 400 });
    }

    const object = await env.PDF_BUCKET.get(key);

    if (!object) {
        return new Response("File not found", { status: 404 });
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);
    headers.set("Content-Disposition", `attachment; filename="${key.split('/').pop()}"`);

    return new Response(object.body, { headers });
}
