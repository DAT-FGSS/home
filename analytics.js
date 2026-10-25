/* Shared GA4 tag for every page under https://dat-fgss.github.io/home/
   In each HTML <head>, after the charset meta:
   <script async src="https://www.googletagmanager.com/gtag/js?id=G-ZXF6ZBGWE7"></script>
   <script src="analytics.js"></script>     site root
   <script src="../analytics.js"></script>  one folder down
   gtag('config') sends the first-load page_view. */
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', 'G-ZXF6ZBGWE7');
