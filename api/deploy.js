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

    if (html.length > 5 * 1024 * 1024) {
      return res.status(413).json({
        success: false,
        message: "HTML maksimal 5 MB."
      });
    }

    /*
     * 1. Pastikan project Vercel tersedia.
     */

    const projectResponse = await fetch(
      `https://api.vercel.com/v9/projects/${encodeURIComponent(projectName)}`,
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
      const createProjectResponse = await fetch(
        "https://api.vercel.com/v10/projects",
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

      project = JSON.parse(createText);
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

    /*
     * 2. Upload index.html.
     */

    const fileBuffer =
      new TextEncoder().encode(html);

    const uploadResponse = await fetch(
      "https://api.vercel.com/v2/files",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "text/html"
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

    let uploadData;

    try {
      uploadData = JSON.parse(uploadText);
    } catch {
      uploadData = {};
    }

    /*
     * 3. Buat deployment.
     */

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
              data: uploadData
            }
          ],

          target: "production"
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

    /*
     * 4. Hasil deployment.
     */

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
      url: deploymentUrl,
      alias:
        deployment.alias || [],
      projectId:
        project.id || null
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



