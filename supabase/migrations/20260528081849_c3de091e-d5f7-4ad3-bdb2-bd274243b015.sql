
-- Roles enum
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

-- Profiles
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  mobile text UNIQUE NOT NULL,
  name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select_all" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- User roles
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role public.app_role NOT NULL,
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "roles_select_self_or_admin" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "roles_admin_manage" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Auto-create profile + default role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_mobile text;
  v_name text;
  v_role public.app_role;
BEGIN
  v_mobile := COALESCE(NEW.raw_user_meta_data->>'mobile', split_part(NEW.email, '@', 1));
  v_name := COALESCE(NEW.raw_user_meta_data->>'name', v_mobile);
  v_role := COALESCE((NEW.raw_user_meta_data->>'role')::public.app_role, 'user');

  INSERT INTO public.profiles (id, mobile, name) VALUES (NEW.id, v_mobile, v_name)
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, v_role)
    ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Teams
CREATE TABLE public.teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teams TO authenticated;
GRANT ALL ON public.teams TO service_role;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
CREATE POLICY "teams_select_all" ON public.teams FOR SELECT TO authenticated USING (true);
CREATE POLICY "teams_admin_write" ON public.teams FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "teams_admin_update" ON public.teams FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "teams_admin_delete" ON public.teams FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Players
CREATE TABLE public.players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  mobile text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.players TO authenticated;
GRANT ALL ON public.players TO service_role;
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
CREATE POLICY "players_select_all" ON public.players FOR SELECT TO authenticated USING (true);
CREATE POLICY "players_admin_write" ON public.players FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "players_admin_update" ON public.players FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "players_admin_delete" ON public.players FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Matches
CREATE TABLE public.matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_a_id uuid REFERENCES public.teams(id) ON DELETE CASCADE NOT NULL,
  team_b_id uuid REFERENCES public.teams(id) ON DELETE CASCADE NOT NULL,
  overs int NOT NULL DEFAULT 6,
  wide_run int NOT NULL DEFAULT 1,
  noball_run int NOT NULL DEFAULT 1,
  match_type text,
  ground text,
  match_date timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'upcoming', -- upcoming | live | past
  result text,
  batting_first_id uuid REFERENCES public.teams(id),
  current_innings int NOT NULL DEFAULT 1,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.matches TO authenticated;
GRANT ALL ON public.matches TO service_role;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "matches_select_all" ON public.matches FOR SELECT TO authenticated USING (true);
CREATE POLICY "matches_admin_insert" ON public.matches FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "matches_update_auth" ON public.matches FOR UPDATE TO authenticated USING (true);
CREATE POLICY "matches_admin_delete" ON public.matches FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Innings
CREATE TABLE public.innings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid REFERENCES public.matches(id) ON DELETE CASCADE NOT NULL,
  innings_no int NOT NULL,
  batting_team_id uuid REFERENCES public.teams(id) NOT NULL,
  bowling_team_id uuid REFERENCES public.teams(id) NOT NULL,
  runs int NOT NULL DEFAULT 0,
  wickets int NOT NULL DEFAULT 0,
  legal_balls int NOT NULL DEFAULT 0,
  is_closed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(match_id, innings_no)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.innings TO authenticated;
GRANT ALL ON public.innings TO service_role;
ALTER TABLE public.innings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "innings_select_all" ON public.innings FOR SELECT TO authenticated USING (true);
CREATE POLICY "innings_auth_write" ON public.innings FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "innings_auth_update" ON public.innings FOR UPDATE TO authenticated USING (true);
CREATE POLICY "innings_admin_delete" ON public.innings FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Balls
CREATE TABLE public.balls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  innings_id uuid REFERENCES public.innings(id) ON DELETE CASCADE NOT NULL,
  match_id uuid REFERENCES public.matches(id) ON DELETE CASCADE NOT NULL,
  ball_index int NOT NULL, -- sequential order
  over_number int NOT NULL,
  ball_in_over int NOT NULL,
  batter_id uuid REFERENCES public.players(id) ON DELETE SET NULL,
  non_striker_id uuid REFERENCES public.players(id) ON DELETE SET NULL,
  bowler_id uuid REFERENCES public.players(id) ON DELETE SET NULL,
  runs int NOT NULL DEFAULT 0,           -- runs credited to batter (or 0 for extras)
  extra_runs int NOT NULL DEFAULT 0,      -- additional extra runs (e.g. wide penalty)
  extra_type text,                        -- wide | no_ball | bye | leg_bye | null
  is_wicket boolean NOT NULL DEFAULT false,
  wicket_type text,
  is_legal boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX balls_innings_idx ON public.balls(innings_id, ball_index);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.balls TO authenticated;
GRANT ALL ON public.balls TO service_role;
ALTER TABLE public.balls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "balls_select_all" ON public.balls FOR SELECT TO authenticated USING (true);
CREATE POLICY "balls_auth_insert" ON public.balls FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "balls_auth_update" ON public.balls FOR UPDATE TO authenticated USING (true);
CREATE POLICY "balls_auth_delete" ON public.balls FOR DELETE TO authenticated USING (true);

-- Friends
CREATE TABLE public.friends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  friend_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, friend_user_id)
);
GRANT SELECT, INSERT, DELETE ON public.friends TO authenticated;
GRANT ALL ON public.friends TO service_role;
ALTER TABLE public.friends ENABLE ROW LEVEL SECURITY;
CREATE POLICY "friends_own_select" ON public.friends FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "friends_own_insert" ON public.friends FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "friends_own_delete" ON public.friends FOR DELETE TO authenticated USING (user_id = auth.uid());
