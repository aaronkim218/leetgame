{
  description = "leetgame dev environment";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";

  outputs = { self, nixpkgs }:
    let
      pkgs = nixpkgs.legacyPackages.aarch64-darwin;
    in {
      devShells.aarch64-darwin.default = pkgs.mkShell {
        packages = with pkgs; [
          # backend (go.mod requires >= 1.25)
          go
          gopls
          gofumpt
          golangci-lint

          # frontend + mobile (.nvmrc / CI pin node 24)
          nodejs_24

          # local supabase stack (replaces brew install)
          supabase-cli
        ];
      };
    };
}
