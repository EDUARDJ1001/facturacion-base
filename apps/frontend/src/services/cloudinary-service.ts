interface UploadProductImageOptions {
  file: File;
  /** Código de la empresa: define la carpeta de sus imágenes. */
  companyCode: string;
}

interface CloudinaryUploadResponse {
  secure_url: string;
}

const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

function companyFolder(companyCode: string) {
  const slug = companyCode.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return `sistema_inventario/${slug || "empresa"}`;
}

export const cloudinaryService = {
  async uploadProductImage({ file, companyCode }: UploadProductImageOptions) {
    if (!CLOUD_NAME || !UPLOAD_PRESET) {
      throw new Error("La carga de imágenes no está configurada en este equipo.");
    }

    const formData = new FormData();
    formData.set("file", file);
    formData.set("upload_preset", UPLOAD_PRESET);
    formData.set("folder", companyFolder(companyCode));

    const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
      method: "POST",
      body: formData
    });

    if (!response.ok) {
      throw new Error("No se pudo subir la imagen.");
    }

    const data = (await response.json()) as CloudinaryUploadResponse;
    return data.secure_url;
  }
};
