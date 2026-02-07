export type TokenPair = {
  accessToken: string;
  refreshToken: string;
  tokenType: "bearer";
  expiresIn: number;
};

export type AuthResponse = {
  user: UserProfile;
};

export type UserProfile = {
  id: string;
  email: string;
  username: string;
  role: string;
  createdAt: string;
};
