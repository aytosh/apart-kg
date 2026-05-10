import webpush from "web-push";

const keys = webpush.generateVAPIDKeys();
console.log("Сгенерированы VAPID-ключи. Добавьте в backend/.env:");
console.log("");
console.log(`VAPID_PUBLIC_KEY="${keys.publicKey}"`);
console.log(`VAPID_PRIVATE_KEY="${keys.privateKey}"`);
console.log(`VAPID_SUBJECT="mailto:admin@apart.kg"`);
