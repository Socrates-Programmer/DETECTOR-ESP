// Integración ESP-32 S3 Waveshare con la aplicación web
// Este es un ejemplo de código C para tu ESP-32

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// Configuración WiFi
const char* ssid = "TU_SSID";
const char* password = "TU_PASSWORD";

// Configuración del servidor
const char* serverURL = "http://tu_ip_o_dominio:3000";

// Variables globales
String userToken = "";        // Token JWT del usuario
String espKey = "";           // Clave única del ESP
String espName = "Mi Sensor"; // Nombre del ESP

// ==================== SETUP ====================
void setup() {
  Serial.begin(115200);
  delay(1000);
  
  Serial.println("\n\n=== ESP-32 Iniciando ===");
  
  // Generar clave única del ESP (usando MAC address)
  generateESPKey();
  
  // Conectarse a WiFi
  connectToWiFi();
}

// ==================== LOOP ====================
void loop() {
  if (WiFi.status() == WL_CONNECTED) {
    // Ejemplo: Registrar ESP cada 10 segundos (cambiar según necesario)
    delay(10000);
    
    // Si tienes un token, intenta registrar el ESP
    if (userToken != "") {
      registerESPDevice();
    }
  } else {
    Serial.println("WiFi desconectado, reconectando...");
    connectToWiFi();
    delay(5000);
  }
}

// ==================== FUNCIONES ====================

// Conectar a WiFi
void connectToWiFi() {
  Serial.print("Conectando a WiFi: ");
  Serial.println(ssid);
  
  WiFi.begin(ssid, password);
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n✓ WiFi conectado");
    Serial.print("IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\n✗ Error al conectar a WiFi");
  }
}

// Generar clave única del ESP
void generateESPKey() {
  // Usar la dirección MAC del ESP como base
  uint8_t mac[6];
  WiFi.macAddress(mac);
  
  // Crear una clave única
  char key[25];
  sprintf(key, "ESP32-%02X%02X%02X%02X%02X%02X", 
          mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
  
  espKey = String(key);
  Serial.print("Clave ESP generada: ");
  Serial.println(espKey);
}

// Login (Después de que el usuario hace login en la web)
// Esta función sería llamada desde el ESP si es necesario
// O se puede hacer desde la app web y enviar el token al ESP
void loginUser(String email, String password) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("No hay conexión WiFi");
    return;
  }
  
  HTTPClient http;
  String url = String(serverURL) + "/api/auth/login";
  
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  
  // Crear JSON con credenciales
  StaticJsonDocument<200> doc;
  doc["email"] = email;
  doc["password"] = password;
  
  String payload;
  serializeJson(doc, payload);
  
  Serial.println("Intentando login...");
  Serial.println(payload);
  
  int httpCode = http.POST(payload);
  
  if (httpCode == 200) {
    String response = http.getString();
    Serial.println("✓ Login exitoso");
    Serial.println(response);
    
    // Parsear respuesta para obtener token
    StaticJsonDocument<500> responseDoc;
    deserializeJson(responseDoc, response);
    userToken = responseDoc["token"].as<String>();
    
    Serial.print("Token guardado: ");
    Serial.println(userToken.substring(0, 20) + "...");
    
    // Ahora registrar el ESP
    registerESPDevice();
    
  } else {
    Serial.print("✗ Error en login: ");
    Serial.println(httpCode);
    Serial.println(http.getString());
  }
  
  http.end();
}

// Registrar ESP en la cuenta del usuario
void registerESPDevice() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("No hay conexión WiFi");
    return;
  }
  
  if (userToken == "") {
    Serial.println("No hay token de usuario");
    return;
  }
  
  HTTPClient http;
  String url = String(serverURL) + "/api/esp/register";
  
  http.begin(url);
  http.addHeader("Authorization", "Bearer " + userToken);
  http.addHeader("Content-Type", "application/json");
  
  // Crear JSON con datos del ESP
  StaticJsonDocument<200> doc;
  doc["esp_key"] = espKey;
  doc["name"] = espName;
  
  String payload;
  serializeJson(doc, payload);
  
  Serial.println("Registrando ESP...");
  Serial.println(payload);
  
  int httpCode = http.POST(payload);
  
  if (httpCode == 201) {
    Serial.println("✓ ESP registrado exitosamente");
    String response = http.getString();
    Serial.println(response);
    
  } else if (httpCode == 400) {
    Serial.println("✗ ESP ya está registrado en otra cuenta");
    
  } else {
    Serial.print("✗ Error al registrar ESP: ");
    Serial.println(httpCode);
    Serial.println(http.getString());
  }
  
  http.end();
}

// Verificar si el ESP está registrado
void checkESPRegistered() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("No hay conexión WiFi");
    return;
  }
  
  HTTPClient http;
  String url = String(serverURL) + "/api/esp/check-key";
  
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  
  // Crear JSON con clave del ESP
  StaticJsonDocument<200> doc;
  doc["esp_key"] = espKey;
  
  String payload;
  serializeJson(doc, payload);
  
  Serial.println("Verificando ESP...");
  
  int httpCode = http.POST(payload);
  
  if (httpCode == 200) {
    Serial.println("✓ ESP está registrado");
    
  } else if (httpCode == 404) {
    Serial.println("✗ ESP no está registrado");
    
  } else {
    Serial.print("✗ Error: ");
    Serial.println(httpCode);
  }
  
  http.end();
}

// Enviar datos del sensor al servidor (ejemplo)
void sendSensorData(float temperature, float humidity) {
  if (WiFi.status() != WL_CONNECTED || userToken == "") {
    Serial.println("No hay conexión o token");
    return;
  }
  
  HTTPClient http;
  String url = String(serverURL) + "/api/esp/data";
  
  http.begin(url);
  http.addHeader("Authorization", "Bearer " + userToken);
  http.addHeader("Content-Type", "application/json");
  
  // Crear JSON con datos del sensor
  StaticJsonDocument<200> doc;
  doc["esp_key"] = espKey;
  doc["temperature"] = temperature;
  doc["humidity"] = humidity;
  doc["timestamp"] = millis();
  
  String payload;
  serializeJson(doc, payload);
  
  int httpCode = http.POST(payload);
  
  if (httpCode == 200) {
    Serial.println("✓ Datos enviados");
  } else {
    Serial.print("✗ Error al enviar datos: ");
    Serial.println(httpCode);
  }
  
  http.end();
}

// ==================== EJEMPLO DE USO ====================

/*
Para usar este código:

1. Instala la librería ArduinoJson:
   - Arduino IDE: Sketch → Include Library → Manage Libraries
   - Busca "ArduinoJson" e instala

2. Configuración:
   - Reemplaza "TU_SSID" y "TU_PASSWORD" con tus credenciales WiFi
   - Reemplaza "tu_ip_o_dominio:3000" con la IP o dominio de tu servidor

3. Flujo de autenticación:
   a) ESP se conecta a WiFi
   b) Usuario hace login en la web
   c) Usuario obtiene token
   d) ESP recibe token (vía API o hardcodeado para pruebas)
   e) ESP usa token para registrarse a sí mismo

4. Llamadas de función:

   // Login
   loginUser("usuario@email.com", "password123");
   
   // Verificar si está registrado
   checkESPRegistered();
   
   // Enviar datos
   sendSensorData(25.5, 60.0);

// NOTA IMPORTANTE SOBRE SEGURIDAD:
// - NO hardcodees credenciales en producción
// - Usa HTTPS en lugar de HTTP
// - Valida los datos en el servidor
// - Implementa rate limiting
// - Usa certificados SSL
*/
