export type RuntimeEnvironmentNotice = {
  label: string;
  detail: string;
};

export function getRuntimeEnvironmentNotice(
  env: Record<string, string | undefined> = process.env,
): RuntimeEnvironmentNotice | null {
  if (env.APP_ENV === 'test-db') {
    return {
      label: 'ENTORNO DE PRUEBA',
      detail: 'Base Docker aislada: los datos no afectan producciÃ³n.',
    };
  }

  if (env.VERCEL_ENV === 'preview') {
    return {
      label: 'PREVIEW DE PRUEBA',
      detail: 'Este despliegue no usa la base productiva.',
    };
  }

  if (env.NODE_ENV === 'development') {
    return {
      label: 'DESARROLLO LOCAL',
      detail: 'El acceso a la base productiva estÃ¡ bloqueado.',
    };
  }

  return null;
}
