import crypto from "crypto";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "Method Not Allowed"
    });
  }

  try {
    const token = process.env.VERCEL_TOKEN;

    if (!token) {
      return res.status(500).json({
        success: false,
        message: "VERCEL_TOKEN belum tersedia."
      });
    }

    const { projectName, html } = req.body || {};

    if (!projectName || !html) {
      return res.status(400).json({
        success: false,
        message: "projectName dan html wajib diisi."
      });
    }

    if (!/^[a-z0-9-]+$/i.test(projectName)) {
      return res.status(400).json({
        success: false,
        message:
          "Nama project hanya boleh huruf, angka, dan tanda -."
      });
    }

    if (projectName.length < 3 || projectName.length > 52) {
      return res.status(400).json({
        success: false,
        message: "Nama project harus 3-52 karakter."
      });
    }

    const fileBuffer = Buffer.from(html, "utf8");
    const fileSize = fileBuffer.length;

    if (fileSize > 5 * 1024 * 1024) {
      return res.status(413).json({
        success: false,
        message: "HTML maksimal 5 MB."
      });
    }

    // ==========================================
    // 1. CEK PROJECT
    // ==========================================

    const projectResponse = await fetch(
      `https://api.vercel.com/v9/projects/${encodeURIComponent(
        projectName
      )}`,
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );

    let project;

    if (projectResponse.ok) {
      project = await projectResponse.json();

    } else if (projectResponse.status === 404) {

      // ==========================================
      // 2. BUAT PROJECT JIKA BELUM ADA
      // ==========================================

      const createProjectResponse = await fetch(
        "https://api.vercel.com/v9/projects",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            name: projectName
          })
        }
      );

      const createText =
        await createProjectResponse.text();

      if (!createProjectResponse.ok) {
        return res.status(500).json({
          success: false,
          stage: "create-project",
          message: "Gagal membuat project Vercel.",
          details: createText
        });
      }

      try {
        project = JSON.parse(createText);
      } catch {
        return res.status(500).json({
          success: false,
          stage: "create-project",
          message: "Response project tidak valid.",
          details: createText
        });
      }

    } else {

      const errorText =
        await projectResponse.text();

      return res.status(500).json({
        success: false,
        stage: "get-project",
        message: "Gagal mengecek project.",
        details: errorText
      });
    }

    // ==========================================
    // 3. BUAT SHA256 FILE
    // ==========================================

    const sha = crypto
      .createHash("sha1")
      .update(fileBuffer)
      .digest("hex");

    // ==========================================
    // 4. UPLOAD FILE KE VERCEL
    // ==========================================

    const uploadResponse = await fetch(
      "https://api.vercel.com/v2/files",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "text/html",
          "x-vercel-digest": sha
        },
        body: fileBuffer
      }
    );

    const uploadText =
      await uploadResponse.text();

    if (!uploadResponse.ok) {
      return res.status(500).json({
        success: false,
        stage: "upload",
        message: "Upload file gagal.",
        details: uploadText
      });
    }

    // ==========================================
    // 5. BUAT DEPLOYMENT
    // ==========================================

    const deploymentResponse = await fetch(
      "https://api.vercel.com/v13/deployments",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name: projectName,

          project: project.id,

          files: [
            {
              file: "index.html",
              sha: sha,
              size: fileSize
            }
          ],

          target: "production",

          projectSettings: {
            framework: null
          }
        })
      }
    );

    const deploymentText =
      await deploymentResponse.text();

    let deployment;

    try {
      deployment =
        JSON.parse(deploymentText);
    } catch {
      deployment = {
        raw: deploymentText
      };
    }

    if (!deploymentResponse.ok) {
      return res.status(500).json({
        success: false,
        stage: "deployment",
        message: "Deployment gagal.",
        details: deployment
      });
    }

    // ==========================================
    // 6. HASIL
    // ==========================================

    const deploymentUrl =
      deployment.url
        ? `https://${deployment.url}`
        : null;

    return res.status(200).json({
      success: true,
      message: "Deployment berhasil.",

      projectName,

      deploymentId:
        deployment.id || null,

      url:
        deploymentUrl,

      projectId:
        project.id || null,

      state:
        deployment.readyState || null
    });

  } catch (error) {

    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message
    });
  }
}
