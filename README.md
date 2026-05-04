# Ellis Car Care, website

A static website for a Burns Park summer car detailing business.

## How to update the site (no code skills needed)

Almost everything you'd want to change lives in **`config.js`**. Open it in any text editor (Notepad, TextEdit, VS Code).

### Change a price
Find the bundle in the `bundles` array. Update the `price` value. Save. Reload the site. The card AND the Google search snippet update automatically.

### Update "Next available"
Find `nextAvailable:` near the top. Type whatever Ellis's next opening is, like `"Saturday May 10, 2pm"`. Save. Empty string hides the line.

### Add or remove an FAQ
Edit the `faq` array. Each entry has a `q` (question) and `a` (answer).

### Change phone, email, or Venmo handle
Edit the `contact` block.

### Update the photo of Ellis (when there is one)
Drop a JPEG named `ellis-portrait.jpg` (about 600x800, vertical) into `images/`. Reload.

### Add a before/after photo
Drop a JPEG into `images/jobs/`. Names like `before-1.jpg` and `after-1.jpg`. Then bump `JOBS_COUNT` in `config.js` and a Recent Jobs section will appear on the page.

## How to put it on the internet

### Easy mode: Netlify Drop (free, 30 seconds)
1. Go to https://app.netlify.com/drop in any browser
2. Drag the entire `ellis-car-care` folder onto the page
3. Netlify gives you a URL like `random-name-123.netlify.app`. Done.
4. To use a real domain (like elliscarcare.com), buy one and follow Netlify's "Add custom domain" instructions.

### Alt: GitHub Pages
Create a public repo, push these files, enable Pages on the main branch.

## Hooking up the booking form

By default the form opens an email to Ellis. To get fancier:

1. Sign up at https://formspree.io (free, 50 submissions/month)
2. Create a new form, copy the form ID (looks like `xrgjzpqv`)
3. Paste it into `config.js` as `formspreeId: "xrgjzpqv"`
4. Save and re-deploy

Submissions will email you AND show up in your Formspree dashboard.

## File map

```
index.html       The page itself
styles.css       All the visual styling
app.js           The interactions (sticky button, sun rotation, etc.)
config.js        All the editable content (prices, contact, FAQ)
thanks.html      Where the form sends you after submission
404.html         Friendly "page not found"
images/          Illustrations + photos
fonts/           (Google Fonts CDN is used for now)
```

## What's intentionally NOT here

- Online payments. Cash and Venmo are enough for a teen business.
- A booking calendar. The form (or text) is enough. Confirm by text.
- A blog. Save it for later.
- Tracking pixels or analytics. Privacy first.
