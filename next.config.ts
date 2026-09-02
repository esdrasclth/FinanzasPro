import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Cuánto vale lo que el router ya tiene en memoria, en segundos.
    //
    // Todas las pantallas leen la cookie de sesión, así que para Next son
    // dinámicas, y para esas el valor por defecto es 0: cada vez que vuelves a
    // una pantalla se pide entera al servidor otra vez, aunque acabes de
    // salir de ella. Con 30 segundos, ir y volver entre dos pantallas es
    // inmediato y no cuesta ningún viaje.
    //
    // El riesgo es ver datos de hasta medio minuto atrás al volver, pero las
    // pantallas ya se refrescan solas cuando algo cambia (datos-bus.ts emite
    // el cambio y quien escucha recarga), así que un movimiento recién
    // guardado no se queda escondido.
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
};

export default nextConfig;
