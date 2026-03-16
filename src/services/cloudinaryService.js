/**
 * Cloudinary File Upload Service
 * Bu servis, cihazdan seçilen dosyaları (resim veya belge) alır, Cloudinary'ye yükler
 * ve yüklü dosyanın HTTPS URL'sini (secure_url) döndürür.
 */

export const uploadToCloudinary = async (file) => {
    // eslint-disable-next-line no-useless-catch
    try {
        const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
        const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

        if (!cloudName || !uploadPreset) {
            
            throw new Error("Eksik Cloudinary API bilgileri.");
        }

        const formData = new FormData();
        formData.append("file", file);
        formData.append("upload_preset", uploadPreset);

        // PDF dosyaları raw endpoint'e yüklenmeli, aksi halde /image/upload/ URL'si oluşur
        // ve tarayıcı PDF'yi görüntüleyemez.
        const isPdf = file.type === 'application/pdf' || file.name?.toLowerCase().endsWith('.pdf');
        const resourceType = isPdf ? 'raw' : 'image';

        const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`, {
            method: 'POST',
            body: formData,
        });

        const data = await response.json();

        if (response.ok) {
            return {
                url: data.secure_url,
                publicId: data.public_id,
                name: file.name,
                type: file.type || data.format
            };
        } else {
            
            throw new Error(data.error.message);
        }
    } catch (error) {
        
        throw error;
    }
};
