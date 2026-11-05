// Datos del usuario que hace la petición. Los deja el AuthGuard en request.user.
export interface CurrentUserData {
  id: string;
  email: string;
  fullName: string;
  roles: string[];
  // Edificios que administra si es SPOC de Edificio
  spocBuildingIds: string[];
}
