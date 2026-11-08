import { Routes } from "@angular/router";

export const AUTH_ROUTES: Routes = [
  {
    path: "",
    pathMatch: "full",
    redirectTo: "login",
  },
  {
    path: "login",
    loadComponent: () => import("./pages/login/login").then((m) => m.Login),
  },
  {
    path: "forget-password",
    loadComponent: () =>
      import("./pages/forget-password/forget-password").then((m) => m.ForgetPassword),
  },
  {
    path: "email-verification",
    loadComponent: () =>
      import("./pages/email-verification/email-verification").then((m) => m.EmailVerification),
  },
  {
    path: "create-new-password",
    loadComponent: () =>
      import("./pages/create-new-password/create-new-password").then((m) => m.CreateNewPassword),
  },
  {
    path: "password-success",
    loadComponent: () =>
      import("./pages/password-success/password-success").then((m) => m.PasswordSuccess),
  },
];
