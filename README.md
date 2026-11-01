# SmartGest - projet Capacitor (APK)

## Obtenir l'APK sans Android Studio
1. Cree un depot GitHub et envoie-y tout le contenu de ce dossier (git add . puis git push).
2. Ouvre l'onglet Actions du depot : le workflow "apk" se lance tout seul.
3. Quand il est vert, ouvre l'execution et telecharge l'artefact "smartgest-apk" (fichier app-debug.apk).
4. Copie l'APK sur le telephone et installe-le (autorise les sources inconnues).

## En local (si tu veux)
npm install
npx cap add android
npx cap sync android
Puis ouvre le dossier android/ avec Android Studio.

## Notes
- La page est www/index.html : modifie-la, pousse sur GitHub, un nouvel APK est construit.
- Les telechargements (rapport CSV, sauvegarde) passent par le partage Android.
- Le code PIN chiffre les donnees (AES-256-GCM) : un code oublie ne se recupere pas. Exporte des sauvegardes.
- Pour vendre l'application : creer une version release signee avec ta propre cle, et la garder en lieu sur.
- Les dependances sont en "latest" pour un premier build ; une fois que tout marche, fige les versions dans package.json.
