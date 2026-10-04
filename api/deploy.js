export default async function handler(req, res) {
  // ================================
  // 4TECH DEPLOYERS - API V1
  // ================================

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "Method Not Allowed"
    });
  }

  try {
    // -------------------------------
    // CHECK TOKEN
    // -------------------------------
    const token = process.env.VERCEL_TOKEN;

    if (!token) {
      return res.status(500).json({
        success: false,
        message: "VERCEL_TOKEN belum tersedia di Environment Variables."
      });
    }

    // -------------------------------
    // READ REQUEST
    // -------------------------------
    const body = req.body || {};

    const projectName = String(body.projectName || "").trim();
    const html = String(body.html || "");

    // -------------------------------
    // VALIDATE PROJECT NAME
    // -------------------------------
    if (!projectName) {
      return res.status(400).json({
        success: false,
        message: "Nama project wajib diisi."
      });
    }

    if (!/^[a-z0-9-]+$/i.test(projectName)) {
      return res.status(400).json({
        success: false,
        message: "Nama project hanya boleh menggunakan huruf, angka, dan tanda -."
      });
    }

    if (projectName.length < 3 || projectName.length > 52) {
      return res.status(400).json({
        success: false,
        message: "Nama project harus 3-52 karakter."
      });
    }

    // -------------------------------
    // VALIDATE HTML
    // -------------------------------
    if (!html.trim()) {
      return res.status(400).json({
        success: false,
        message: "HTML tidak boleh kosong."
      });
    }

    if (html.length > 5 * 1024 * 1024) {
      return res.status(413).json({
        success: false,
        message: "Ukuran HTML terlalu besar. Maksimal 5 MB."
      });
    }

    // -------------------------------
    // CREATE FILE DIGEST
    // -------------------------------
    const encoder = new TextEncoder();

    const data = encoder.encode(html);

    const hashBuffer = await crypto.subtle.digest(
      "SHA-1",
      data
    );

    const hashArray = Array.from(
      new Uint8Array(hashBuffer)
    );

    const sha = hashArray
      .map(byte => byte.toString(16).padStart(2, "0"))
      .join("");

    // -------------------------------
    // UPLOAD FILE TO VERCEL
    // -------------------------------
    const uploadResponse = await fetch(
      "https://api.vercel.com/v2/now/files",
      {
        method: "POST",

        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "text/html; charset=utf-8",
          "x-vercel-digest": sha
        },

        body: data
      }
    );

    const uploadText = await uploadResponse.text();

    if (!uploadResponse.ok) {
      return res.status(uploadResponse.status).json({
        success: false,
        stage: "upload",
        message: "Upload file ke Vercel gagal.",
        details: uploadText
      });
    }

    // -------------------------------
    // CREATE DEPLOYMENT
    // -------------------------------
    const deploymentResponse = await fetch(
      "https://api.vercel.com/v12/now/deployments",
      {
        method: "POST",

        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },

        body: JSON.stringify({
          name: projectName,

          files: [
            {
              file: "index.html",
              sha: sha,
              size: data.byteLength
            }
          ],

          projectSettings: {
            framework: null
          }
        })
      }
    );

    const deploymentText =
      await deploymentResponse.text();

    let deploymentData;

    try {
      deploymentData =
        JSON.parse(deploymentText);
    } catch {
      deploymentData = {
        raw: deploymentText
      };
    }

    if (!deploymentResponse.ok) {
      return res.status(deploymentResponse.status).json({
        success: false,
        stage: "deployment",
        message: "Deployment Vercel gagal.",
        details: deploymentData
      });
    }

    // -------------------------------
    // DEPLOYMENT URL
    // -------------------------------
    const deploymentUrl =
      deploymentData.url
        ? `https://${deploymentData.url}`
        : null;

    // -------------------------------
    // RESPONSE
    // -------------------------------
    return res.status(200).json({
      success: true,

      message:
        "Deployment berhasil dibuat.",

      projectName: projectName,

      deploymentId:
        deploymentData.id || null,

      url:
        deploymentUrl,

      raw:
        deploymentData
    });

  } catch (error) {

    console.error(
      "4TECH DEPLOY ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Internal Server Error.",
      error: error.message
    });
  }
}



