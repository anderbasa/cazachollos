// Configuración pública de Firebase para la web (no es secreta: la seguridad la dan las reglas
// de Firestore, que solo dejan entrar a tu cuenta). Registrada como "Cazachollos web".
export const FIREBASE = {
  "apiKey": "AIzaSyAF3CHl7WYtnMBAQeOzjt4pMKJQGbr2-1s",
  "authDomain": "cazachollos-e21c1.firebaseapp.com",
  "projectId": "cazachollos-e21c1",
  "storageBucket": "cazachollos-e21c1.firebasestorage.app",
  "messagingSenderId": "137772149692",
  "appId": "1:137772149692:web:712c6c6002ba7ad17399b9"
};

// Única cuenta con acceso (también fijada en firestore.rules)
export const CORREO = "anderbasa07@gmail.com";

// Versión del SDK web de Firebase (gstatic). 13.2.0 era demasiado reciente el 8/11/2026.
export const SDK = "https://www.gstatic.com/firebasejs/13.1.0";
