// Front-end configuration for the NDA app.
//
// This file is public — it is served to every visitor. Never put an API key,
// password or other secret here. The email credentials live in server-side
// environment variables read by api/send-nda.js.

window.NDA_CONFIG = {
  // Where the browser POSTs the signed NDA.
  //
  // A relative path works when the page and the API are deployed together
  // (the normal Vercel / Netlify setup). If you host the static page
  // somewhere else, put the full URL of the deployed function here — e.g.
  // 'https://biophotonix-nda.vercel.app/api/send-nda' — and set
  // NDA_ALLOWED_ORIGINS on the server to the page's origin.
  endpoint: '/api/send-nda',

  // Who the on-screen messages tell the signer to contact.
  contactName: 'Adail Islam',
  contactEmail: 'info@biophotonix.co.uk',
};
