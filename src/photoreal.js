// Fotorealistische Assets pro Theme — leicht erweiterbar: neue Loops/Heroes
// einfach hier eintragen (Datei nach /public/assets/photoreal/ legen).
// video: null  ->  Attract fällt auf die bestehende Sprite-Explosion zurück.
// hero:  null  ->  Share-Card fällt auf den illustrierten Snapshot zurück.
export const PHOTOREAL = {
  'bubble-tea': {
    video: '/assets/photoreal/attract-bubble-tea.mp4',   // Brown Sugar Milk Tea
    poster: '/assets/photoreal/attract-bubble-tea-poster.jpg',
    hero: '/assets/photoreal/hero-bubble-tea.jpg'
  },
  smoothie: {
    video: '/assets/photoreal/attract-smoothie.mp4',     // Strawberry Mojito
    poster: '/assets/photoreal/attract-smoothie-poster.jpg',
    hero: '/assets/photoreal/hero-smoothie.jpg'          // Mango-Maracuja
  },
  coffee: {
    video: null,  // noch kein Loop produziert -> Sprite-Fallback
    poster: null,
    hero: '/assets/photoreal/hero-coffee.jpg'            // Iced Caramel Latte
  }
};

export function photorealFor(themeId) {
  return PHOTOREAL[themeId] || null;
}
