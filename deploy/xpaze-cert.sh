#!/bin/sh
# Espera a que xpaze.es apunte a este servidor (registro A, sin proxy) y entonces pide el
# certificado de Let's Encrypt, lo pone en nginx y redirige HTTP a HTTPS. Se ejecuta una vez.
IP=169.58.73.113
CONF=/etc/nginx/sites-available/xpaze
i=0
while [ $i -lt 720 ]; do   # hasta 6 horas
  a=$(dig +short xpaze.es A @1.1.1.1 | tail -1)
  [ "$a" = "$IP" ] && break
  i=$((i+1)); sleep 30
done
[ "$a" = "$IP" ] || { echo "xpaze.es no apunta a $IP: no se pide certificado"; exit 1; }
doms="-d xpaze.es"
[ "$(dig +short www.xpaze.es A @1.1.1.1 | tail -1)" = "$IP" ] && doms="$doms -d www.xpaze.es"
echo "DNS correcto; pidiendo certificado para: $doms"
sleep 20
certbot certonly --webroot -w /var/www/html --cert-name xpaze.es $doms --non-interactive --agree-tos --keep-until-expiring 2>&1 | tail -6 || exit 1
[ -f /etc/letsencrypt/live/xpaze.es/fullchain.pem ] || { echo "sin certificado"; exit 1; }
cp "$CONF" "$CONF.antes-de-letsencrypt"
sed -i "s#ssl_certificate /etc/nginx/ssl-xpaze/origin.crt;#ssl_certificate /etc/letsencrypt/live/xpaze.es/fullchain.pem;#; s#ssl_certificate_key /etc/nginx/ssl-xpaze/origin.key;#ssl_certificate_key /etc/letsencrypt/live/xpaze.es/privkey.pem;#" "$CONF"
# HTTP -> HTTPS (salvo la comprobación local y el reto de Let's Encrypt)
grep -q "redirige a https" "$CONF" || sed -i "s#    location /.well-known/acme-challenge/ { root /var/www/html; }#    location /.well-known/acme-challenge/ { root /var/www/html; }\n    \# redirige a https lo que llegue por el puerto 80 público\n    if (\$server_port = 80) { return 301 https://\$host\$request_uri; }#" "$CONF"
if nginx -t 2>&1 | tail -1 | grep -q successful; then systemctl reload nginx && echo "certificado instalado y nginx recargado"; else cp "$CONF.antes-de-letsencrypt" "$CONF"; echo "configuración no válida: se deja como estaba"; nginx -t 2>&1 | tail -3; fi
