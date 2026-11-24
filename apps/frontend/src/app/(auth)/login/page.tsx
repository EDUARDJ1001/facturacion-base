"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/hooks/use-auth";

const loginSchema = z.object({
  username: z.string().min(1, "Ingresa tu usuario o correo."),
  password: z.string().min(1, "Ingresa tu contraseña.")
});

type LoginValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const toast = useToast();
  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: "",
      password: ""
    }
  });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await login(values);
      router.push("/select-company");
    } catch (submitError) {
      toast.error(submitError instanceof Error ? submitError.message : "No fue posible iniciar sesión.");
    }
  });

  return (
    <main className="grid min-h-screen lg:grid-cols-[1.1fr_0.9fr]">
      <section className="hidden flex-col justify-center bg-slate-950 p-10 text-white lg:flex">
        <div>
          <p className="section-title text-white/50">Multiempresa</p>
          <h1 className="mt-6 max-w-xl text-5xl font-semibold leading-tight">Facturación, caja e inventario para todas tus empresas.</h1>
          <p className="mt-6 max-w-lg text-base text-white/70">
            Emite, consulta y corrige facturas con trazabilidad completa y cada empresa con sus propios datos, documentos y
            correlativos.
          </p>
        </div>
      </section>

      <section className="flex items-center justify-center p-4 sm:p-8 lg:p-10">
        <Card className="w-full max-w-xl p-5 sm:p-8 lg:p-10">
          <p className="section-title">Inicio de sesión</p>
          <h2 className="mt-3 text-3xl font-semibold text-slate-900 sm:text-4xl">Bienvenido</h2>
          <p className="mt-3 text-slate-600">Ingresa con tu usuario para seleccionar la empresa y empezar a trabajar.</p>

          <form className="mt-8 space-y-5 sm:mt-10 sm:space-y-6" onSubmit={onSubmit}>
            <div>
              <Label required htmlFor="username">Usuario o correo</Label>
              <Input id="username" autoComplete="username" {...form.register("username")} />
              {form.formState.errors.username ? <p className="mt-2 text-sm text-rose-600">{form.formState.errors.username.message}</p> : null}
            </div>

            <div>
              <Label required htmlFor="password">Contraseña</Label>
              <Input id="password" type="password" autoComplete="current-password" {...form.register("password")} />
              {form.formState.errors.password ? <p className="mt-2 text-sm text-rose-600">{form.formState.errors.password.message}</p> : null}
            </div>

            <Button className="w-full" size="lg" type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Ingresando..." : "Entrar al sistema"}
            </Button>
          </form>
        </Card>
      </section>
    </main>
  );
}
