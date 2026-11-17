import logoColor from '@/assets/logo/logo.svg'
import logoMonoDark from '@/assets/logo/logo-mono-dark.svg'
import './Logo.css'

export default function Logo({ height = 48 }) {
  return (
    <>
      <img className="logo logo--dark-theme" src={logoColor} alt="Homeflix" height={height} />
      <img className="logo logo--light-theme" src={logoMonoDark} alt="Homeflix" height={height} />
    </>
  )
}
