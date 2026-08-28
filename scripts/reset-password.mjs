/**
 * Resetea la contraseña de un usuario directamente en la base de datos.
 *
 *   node --env-file=.env scripts/reset-password.mjs <email> <nueva-password>
 *
 * Usa los mismos parámetros que el registro (bcrypt, 10 rondas), así que el
 * hash resultante es indistinguible de uno creado por la app.
 */
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const [email, password] = process.argv.slice(2)

if (!email || !password) {
  console.error('Uso: node --env-file=.env scripts/reset-password.mjs <email> <nueva-password>')
  process.exit(1)
}

if (password.length < 8) {
  console.error('La contraseña debe tener al menos 8 caracteres.')
  process.exit(1)
}

const prisma = new PrismaClient()

const user = await prisma.users.findUnique({
  where: { email: email.toLowerCase() },
  select: { id: true, email: true, nombre: true },
})

if (!user) {
  console.error(`No existe ningún usuario con el email ${email}`)
  await prisma.$disconnect()
  process.exit(1)
}

const password_hash = await bcrypt.hash(password, 10)
await prisma.users.update({ where: { id: user.id }, data: { password_hash } })

console.log(`Contraseña actualizada para ${user.email} (${user.nombre ?? 'sin nombre'}).`)
console.log('Ya puedes iniciar sesión con la nueva contraseña.')

await prisma.$disconnect()
