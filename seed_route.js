// Script for seeding route

const OSRM_URL = 'http://router.project-osrm.org/route/v1/driving/31.6023,40.0934;33.1595,39.9149?overview=full&geometries=geojson';

fetch(OSRM_URL)
  .then(res => res.json())
  .then(async data => {
      if (!data.routes || data.routes.length === 0) {
          console.error("Rota bulunamadi");
          return;
      }
      const coords = data.routes[0].geometry.coordinates; // [lon, lat]
      console.log(`OSRM'den ${coords.length} nokta alindi. Seyreltiliyor...`);
      
      // Yaklasik 150 nokta elde etmek icin adim sayisini belirleyelim
      const step = Math.ceil(coords.length / 150);
      const sampledCoords = coords.filter((_, i) => i % step === 0);
      
      console.log(`Seyreltilmis ${sampledCoords.length} nokta gonderiliyor...`);
      
      const API_URL = 'https://www.inaner.tr/api/save-location?token=inaner123';
      
      // Su anki zamandan geriye dogru giderek timestamp olusturalim ki son nokta su an olsun.
      // Toplam yolculuk 2.5 saat sursun (150 dakika).
      const endTime = Date.now();
      const startTime = endTime - (150 * 60 * 1000);
      const timeStep = (endTime - startTime) / sampledCoords.length;

      for (let i = 0; i < sampledCoords.length; i++) {
          const [lon, lat] = sampledCoords[i];
          const timestamp = new Date(startTime + (i * timeStep)).toISOString();
          
          // Sahte hiz verisi (60-80 km/h)
          const speed = 60 + Math.random() * 20;

          const payload = {
              lat: lat.toString(),
              lon: lon.toString(),
              speed: speed.toString(),
              timestamp: timestamp,
              device_id: 'Donus_Yapan_Tir' // Test araci ismini şık yapalim
          };

          try {
              const response = await fetch(API_URL, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(payload)
              });
              
              if (response.ok) {
                  process.stdout.write('.');
              } else {
                  console.error('Hata:', response.status);
              }
          } catch (e) {
              console.error(e.message);
          }
          
          // Rate limit'e takilmamak icin kisa bir bekleme
          await new Promise(r => setTimeout(r, 100));
      }
      
      console.log('\nTum noktalar gonderildi!');
  })
  .catch(err => console.error("OSRM Hatasi:", err));
