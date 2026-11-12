/* FPV Training Console · database connection
   Leave url empty to run in demo mode (data stays in this browser).
   Fill in from Supabase → Project Settings → API:
     url      Project URL           e.g. https://abcdxyz.supabase.co
     anonKey  anon / public key     (safe to publish; access is enforced by the database rules)
   providers: external sign-in buttons to show. Enable each one in
     Supabase → Authentication → Providers first.
     google · azure (Microsoft) · apple · github · facebook
   loginDomain must match the FPV_LOGIN_DOMAIN secret of the fpv-admin function. */
window.FPV_CLOUD_CONFIG = {
  url: 'https://bmjbnuustipwclbqovtl.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJtamJudXVzdGlwd2NsYnFvdnRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQwMTkxNTAsImV4cCI6MjEwOTU5NTE1MH0.Y41t4c-aWp7GGAp9nlYKrfrOns9WdGcyt3eVV25OgW0',
  providers: [],
  loginDomain: 'login.fpv.local',
  lang: 'he',            // login screen language before the user picks one: he · en · es
  title: 'מסוף הדרכה FPV',
  sigil: 'FPV',
  poster: 'deck'         // login poster: toon · hud · tunnel · blueprint · arcade · sunset

};
