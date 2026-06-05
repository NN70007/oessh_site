<?php
// ── Formulaire de contact OESSH Luxembourg ───────────────────────────────
// Envoie le message du formulaire vers les destinataires de la Lieutenance.

header('Content-Type: application/json; charset=utf-8');

// Réservé aux requêtes POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'Méthode non autorisée.']);
    exit;
}

// Anti-spam : champ caché « website » (honeypot) — doit rester vide
if (!empty($_POST['website'])) {
    echo json_encode(['ok' => true]); // on fait semblant d'accepter
    exit;
}

// Récupération + nettoyage
$name    = trim($_POST['name']    ?? '');
$email   = trim($_POST['email']   ?? '');
$message = trim($_POST['message'] ?? '');

// Validation
if ($name === '' || $message === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(422);
    echo json_encode(['ok' => false, 'error' => 'Veuillez remplir tous les champs correctement.']);
    exit;
}

// Nettoyage anti-injection d'en-têtes
$name  = str_replace(["\r", "\n"], ' ', $name);
$email = str_replace(["\r", "\n"], ' ', $email);

// Destinataires
$to = 'secretariat.asbl@oessh.lu, lieutenant@oessh.lu';

$subject = 'Message via oessh.lu — ' . $name;

$body  = "Nouveau message depuis le formulaire de contact du site.\n\n";
$body .= "Nom    : $name\n";
$body .= "Email  : $email\n\n";
$body .= "Message :\n$message\n";

// En-têtes : From = adresse du site, Reply-To = visiteur
$headers  = "From: OESSH Luxembourg <no-reply@oessh.lu>\r\n";
$headers .= "Reply-To: $name <$email>\r\n";
$headers .= "Content-Type: text/plain; charset=UTF-8\r\n";
$headers .= "MIME-Version: 1.0\r\n";

if (mail($to, '=?UTF-8?B?' . base64_encode($subject) . '?=', $body, $headers)) {
    echo json_encode(['ok' => true]);
} else {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => "L'envoi a échoué. Merci de réessayer ou d'écrire directement à secretariat.asbl@oessh.lu."]);
}
