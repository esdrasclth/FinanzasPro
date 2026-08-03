import { createElement } from 'react'
import {
  Utensils, UtensilsCrossed, Coffee, Beer, Wine, Cake, ShoppingCart, ShoppingBasket, ShoppingBag,
  Car, Fuel, Bus, Bike, Plane, SquareParking, House, Lightbulb, Zap, Droplet, Wrench, Hammer,
  Smartphone, Laptop, Wifi, Tv, Gamepad2, Clapperboard, Music, BookOpen, GraduationCap,
  Pill, HeartPulse, Stethoscope, Dumbbell, Shirt, Scissors, Sparkles, PawPrint, Baby, TreePalm,
  Gift, Store, Briefcase, Landmark, PiggyBank, Banknote, CreditCard, Wallet, Receipt, TrendingUp,
  CircleDollarSign, Percent, ShieldCheck, Repeat, Handshake, Scale, ArrowLeftRight, Users,
  Package, Tag, type LucideIcon,
} from 'lucide-react'

// Íconos de categoría: el mismo trazo que el menú, en vez de emojis.
//
// En `categories.icono` se guarda la clave ("ShoppingCart"). Lo que no esté en
// el catálogo se pinta tal cual, que es como se siguen viendo los emojis de
// antes sin tener que convertirlos todos a la fuerza.

export const ICONOS_CATEGORIA: { clave: string; etiqueta: string; Icono: LucideIcon }[] = [
  { clave: 'Utensils', etiqueta: 'Comida', Icono: Utensils },
  { clave: 'UtensilsCrossed', etiqueta: 'Restaurante', Icono: UtensilsCrossed },
  { clave: 'Coffee', etiqueta: 'Café', Icono: Coffee },
  { clave: 'Beer', etiqueta: 'Cerveza', Icono: Beer },
  { clave: 'Wine', etiqueta: 'Vino', Icono: Wine },
  { clave: 'Cake', etiqueta: 'Pastel', Icono: Cake },
  { clave: 'ShoppingCart', etiqueta: 'Supermercado', Icono: ShoppingCart },
  { clave: 'ShoppingBasket', etiqueta: 'Despensa', Icono: ShoppingBasket },
  { clave: 'ShoppingBag', etiqueta: 'Compras', Icono: ShoppingBag },
  { clave: 'Car', etiqueta: 'Carro', Icono: Car },
  { clave: 'Fuel', etiqueta: 'Combustible', Icono: Fuel },
  { clave: 'Bus', etiqueta: 'Transporte', Icono: Bus },
  { clave: 'Bike', etiqueta: 'Bicicleta', Icono: Bike },
  { clave: 'Plane', etiqueta: 'Viajes', Icono: Plane },
  { clave: 'SquareParking', etiqueta: 'Parqueo', Icono: SquareParking },
  { clave: 'House', etiqueta: 'Hogar', Icono: House },
  { clave: 'Lightbulb', etiqueta: 'Servicios', Icono: Lightbulb },
  { clave: 'Zap', etiqueta: 'Electricidad', Icono: Zap },
  { clave: 'Droplet', etiqueta: 'Agua', Icono: Droplet },
  { clave: 'Wrench', etiqueta: 'Mantenimiento', Icono: Wrench },
  { clave: 'Hammer', etiqueta: 'Reparaciones', Icono: Hammer },
  { clave: 'Smartphone', etiqueta: 'Teléfono', Icono: Smartphone },
  { clave: 'Laptop', etiqueta: 'Tecnología', Icono: Laptop },
  { clave: 'Wifi', etiqueta: 'Internet', Icono: Wifi },
  { clave: 'Tv', etiqueta: 'Televisión', Icono: Tv },
  { clave: 'Gamepad2', etiqueta: 'Juegos', Icono: Gamepad2 },
  { clave: 'Clapperboard', etiqueta: 'Cine', Icono: Clapperboard },
  { clave: 'Music', etiqueta: 'Música', Icono: Music },
  { clave: 'BookOpen', etiqueta: 'Libros', Icono: BookOpen },
  { clave: 'GraduationCap', etiqueta: 'Educación', Icono: GraduationCap },
  { clave: 'Pill', etiqueta: 'Medicinas', Icono: Pill },
  { clave: 'HeartPulse', etiqueta: 'Salud', Icono: HeartPulse },
  { clave: 'Stethoscope', etiqueta: 'Consultas', Icono: Stethoscope },
  { clave: 'Dumbbell', etiqueta: 'Gimnasio', Icono: Dumbbell },
  { clave: 'Shirt', etiqueta: 'Ropa', Icono: Shirt },
  { clave: 'Scissors', etiqueta: 'Cuidado personal', Icono: Scissors },
  { clave: 'Sparkles', etiqueta: 'Bienestar', Icono: Sparkles },
  { clave: 'PawPrint', etiqueta: 'Mascotas', Icono: PawPrint },
  { clave: 'Baby', etiqueta: 'Niños', Icono: Baby },
  { clave: 'TreePalm', etiqueta: 'Ocio', Icono: TreePalm },
  { clave: 'Gift', etiqueta: 'Regalos', Icono: Gift },
  { clave: 'Store', etiqueta: 'Negocio', Icono: Store },
  { clave: 'Briefcase', etiqueta: 'Salario', Icono: Briefcase },
  { clave: 'Landmark', etiqueta: 'Banco', Icono: Landmark },
  { clave: 'PiggyBank', etiqueta: 'Ahorros', Icono: PiggyBank },
  { clave: 'Banknote', etiqueta: 'Efectivo', Icono: Banknote },
  { clave: 'CreditCard', etiqueta: 'Tarjeta', Icono: CreditCard },
  { clave: 'Wallet', etiqueta: 'Cartera', Icono: Wallet },
  { clave: 'Receipt', etiqueta: 'Recibos', Icono: Receipt },
  { clave: 'TrendingUp', etiqueta: 'Inversiones', Icono: TrendingUp },
  { clave: 'CircleDollarSign', etiqueta: 'Dinero', Icono: CircleDollarSign },
  { clave: 'Percent', etiqueta: 'Intereses', Icono: Percent },
  { clave: 'ShieldCheck', etiqueta: 'Seguros', Icono: ShieldCheck },
  { clave: 'Repeat', etiqueta: 'Suscripciones', Icono: Repeat },
  { clave: 'Handshake', etiqueta: 'Deudas', Icono: Handshake },
  { clave: 'Scale', etiqueta: 'Ajustes', Icono: Scale },
  { clave: 'ArrowLeftRight', etiqueta: 'Transferencias', Icono: ArrowLeftRight },
  { clave: 'Users', etiqueta: 'Compartido', Icono: Users },
  { clave: 'Package', etiqueta: 'Otros', Icono: Package },
  { clave: 'Tag', etiqueta: 'Etiqueta', Icono: Tag },
]

const POR_CLAVE = new Map(ICONOS_CATEGORIA.map(i => [i.clave, i.Icono]))

export const esClaveDeIcono = (v?: string | null) => !!v && POR_CLAVE.has(v)

export default function IconoCategoria({
  nombre, size = 18, className = '',
}: {
  nombre?: string | null
  size?: number
  className?: string
}) {
  // El ícono sale del catálogo, que es fijo: se instancia con createElement
  // para que quede claro que aquí no se está definiendo un componente nuevo.
  const Icono = nombre ? POR_CLAVE.get(nombre) : undefined
  if (Icono) return createElement(Icono, { size, strokeWidth: 2, className })
  // Sin ícono todavía: la etiqueta neutra.
  if (!nombre) return createElement(Tag, { size, strokeWidth: 2, className })
  // Un emoji de los de antes: se pinta tal cual.
  return <span className={className} style={{ fontSize: size, lineHeight: 1 }}>{nombre}</span>
}
