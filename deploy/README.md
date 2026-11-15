# Despliegue de xpaze.es

Producción: un servidor Ubuntu con nginx, sin túnel (registro A del dominio → IP del servidor, sin proxy de Cloudflare).

| Fichero | Dónde va | Qué hace |
|---|---|---|
| `nginx-xpaze.conf` | `/etc/nginx/sites-available/xpaze` (+ enlace en `sites-enabled`) | Sirve `dist/` y pasa `/app/api/*` al servidor de IA en `127.0.0.1:5193`. Sin registro de visitas. |
| `xpaze-psicologa.service` | `/etc/systemd/system/` | Servidor de IA (`server/psicologa.js`) con las claves de `.env`. |
| `xpaze-cert.sh` | `/usr/local/sbin/` | Espera a que el DNS apunte al servidor, pide el certificado de Let's Encrypt y lo instala en nginx. |

Pasos en un servidor nuevo:

```bash
git clone https://github.com/Gonzalo2010/xpaze.git /opt/xpaze && cd /opt/xpaze
npm ci && cp .env.example .env    # y rellenar las claves
npm run deploy                    # tests + compilación en dist/
sudo cp deploy/xpaze-psicologa.service /etc/systemd/system/ && sudo systemctl enable --now xpaze-psicologa
sudo cp deploy/nginx-xpaze.conf /etc/nginx/sites-available/xpaze && sudo ln -s ../sites-available/xpaze /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo sh deploy/xpaze-cert.sh      # tras crear el registro A del dominio
```

Actualizar: `cd /opt/xpaze && git pull && npm run deploy`.

El vídeo del astronauta de la presentación (`public/presentacion/astronaut.webp`) se genera con
`node scripts/capture-astronaut.cjs frames` (fotogramas de la escena `/astronaut/?embed=1&capture=1`) y
`ffmpeg -framerate 10 -i frames/f%04d.png -c:v libwebp_anim -quality 72 -loop 0 -pix_fmt yuva420p astronaut.webp`.
