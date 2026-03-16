$envs = @{
    "VITE_FIREBASE_AUTH_DOMAIN"="tir-muhasebe.firebaseapp.com";
    "VITE_FIREBASE_PROJECT_ID"="tir-muhasebe";
    "VITE_FIREBASE_STORAGE_BUCKET"="tir-muhasebe.firebasestorage.app";
    "VITE_FIREBASE_MESSAGING_SENDER_ID"="105622311370";
    "VITE_FIREBASE_APP_ID"="1:105622311370:web:d95e154e6a3a06d9817f33";
    "VITE_CLOUDINARY_CLOUD_NAME"="dy3wb2qcs";
    "VITE_CLOUDINARY_UPLOAD_PRESET"="orv2fwiw"
}

foreach ($key in $envs.Keys) {
    $val = $envs[$key]
    Write-Host "Adding $key..."
    $cmd = "'$val' | npx vercel env add $key production"
    Invoke-Expression $cmd
}
Write-Host "Done adding envs."
