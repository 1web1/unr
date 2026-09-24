export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { image } = req.body;
    if (!image) {
      return res.status(400).json({ error: 'No image provided' });
    }

    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const preset = process.env.CLOUDINARY_PRESET;

    const body = new URLSearchParams();
    body.append('file', image);
    body.append('upload_preset', preset);

    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
      method: 'POST',
      body: body
    });

    const data = await response.json();
    
    if (data.secure_url) {
      res.status(200).json({ secure_url: data.secure_url });
    } else {
      res.status(400).json({ error: data.error?.message || 'Upload failed' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
