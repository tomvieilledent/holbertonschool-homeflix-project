import ToastProvider from '@/components/Toast'
import FavouritesProvider from '@/features/favourites/FavouritesProvider'

/** État propre au profil actif : notifications et « Ma liste ». Remonté à chaque changement de profil. */
export default function ProfileScope({ children }) {
  return (
    <ToastProvider>
      <FavouritesProvider>{children}</FavouritesProvider>
    </ToastProvider>
  )
}
