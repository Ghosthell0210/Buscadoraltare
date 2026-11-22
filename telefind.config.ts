// Archivo único de configuración para desplegar TeleFind en Altare desde GitHub.
// Si usas un repositorio PRIVADO en GitHub, puedes rellenar estos valores aquí
// para desplegar directamente sin configurar variables .env en Altare.
// Si tu repositorio es PÚBLICO, déjalos vacíos y usa variables de entorno.

export const TELEFIND_CONFIG = {
  // Obtén apiId y apiHash en https://my.telegram.org
  apiId: Number(process.env.TELEGRAM_API_ID || 0),
  apiHash: process.env.TELEGRAM_API_HASH || '',

  // StringSession exportada desde la pestaña "Conexión MTProto"
  sessionString: process.env.TELEGRAM_SESSION || '',

  // Token obtenido con /newbot en @BotFather
  botToken: process.env.TELEGRAM_BOT_TOKEN || '',

  // Opcional: clave para abrir el panel web usando esta configuración
  webPasscode: process.env.TELEFIND_WEB_PASSCODE || '',
};
