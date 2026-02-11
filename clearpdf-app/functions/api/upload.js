export async function onRequest(context) {
    const { request, env } = context;

    if (request.method !== "POST") {
        return new Response("Method not allowed", { status: 405 });
    }

    try {
        const url = new URL(request.url);
        const customKey = url.searchParams.get("key");

        const formData = await request.formData();
        const file = formData.get("file");
        const fileName = file.name || "document.pdf";
        const fileId = crypto.randomUUID();
        const key = customKey || `uploads/${fileId}_${fileName}`;

        // 将文件存入 R2 存储桶
        await env.PDF_BUCKET.put(key, file.stream(), {
            httpMetadata: { contentType: "application/pdf" }
        });

        return new Response(JSON.stringify({
            success: true,
            fileId,
            key,
            message: "文件已成功暂存到 R2"
        }), {
            headers: { "Content-Type": "application/json" }
        });
    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
}
