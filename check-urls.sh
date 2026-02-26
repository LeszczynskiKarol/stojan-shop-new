#!/bin/bash
# check-urls.sh
# Sprawdza dostępność wszystkich stron mocowych w nowym sklepie
# Użycie: bash check-urls.sh

DOMAIN="https://app-reactapp.ngrok.app"
OK=0
FAIL=0
ERRORS=""

URLS=(
  # Podstawowe moce
  "/silniki-elektryczne-009-kw"
  "/silniki-elektryczne-012-kw"
  "/silniki-elektryczne-018-kw"
  "/silniki-elektryczne-025-kw"
  "/silniki-elektryczne-037-kw"
  "/silniki-elektryczne-055-kw"
  "/silniki-elektryczne-075-kw"
  "/silniki-elektryczne-1-1-kw"
  "/silniki-elektryczne-1-5-kw"
  "/silniki-elektryczne-2-2-kw"
  "/silniki-elektryczne-3-kw"
  "/silniki-elektryczne-4-kw"
  "/silniki-elektryczne-5-5-kw"
  "/silniki-elektryczne-7-5-kw"
  "/silniki-elektryczne-11-kw"
  "/silniki-elektryczne-18-5-kw"
  "/silniki-elektryczne-22-kw"
  "/silniki-elektryczne-30-kw"
  "/silniki-elektryczne-55-kw"
  "/silniki-elektryczne-75-kw"
  "/silniki-elektryczne-110-kw"
  "/silniki-elektryczne-160-kw"
  "/silniki-elektryczne-200-kw"
  # 0.09 kW + obroty
  "/silniki-elektryczne-009-kw-700-obr"
  "/silniki-elektryczne-009-kw-900-obr"
  "/silniki-elektryczne-009-kw-1400-obr"
  "/silniki-elektryczne-009-kw-2900-obr"
  # 0.12 kW
  "/silniki-elektryczne-012-kw-700-obr"
  "/silniki-elektryczne-012-kw-900-obr"
  "/silniki-elektryczne-012-kw-1400-obr"
  "/silniki-elektryczne-012-kw-2900-obr"
  # 0.18 kW
  "/silniki-elektryczne-018-kw-700-obr"
  "/silniki-elektryczne-018-kw-900-obr"
  "/silniki-elektryczne-018-kw-1400-obr"
  "/silniki-elektryczne-018-kw-2900-obr"
  # 0.25 kW
  "/silniki-elektryczne-025-kw-700-obr"
  "/silniki-elektryczne-025-kw-900-obr"
  "/silniki-elektryczne-025-kw-1400-obr"
  "/silniki-elektryczne-025-kw-2900-obr"
  # 0.37 kW
  "/silniki-elektryczne-037-kw-700-obr"
  "/silniki-elektryczne-037-kw-900-obr"
  "/silniki-elektryczne-037-kw-1400-obr"
  "/silniki-elektryczne-037-kw-2900-obr"
  # 0.55 kW
  "/silniki-elektryczne-055-kw-700-obr"
  "/silniki-elektryczne-055-kw-900-obr"
  "/silniki-elektryczne-055-kw-1400-obr"
  "/silniki-elektryczne-055-kw-2900-obr"
  # 0.75 kW
  "/silniki-elektryczne-075-kw-700-obr"
  "/silniki-elektryczne-075-kw-900-obr"
  "/silniki-elektryczne-075-kw-1400-obr"
  "/silniki-elektryczne-075-kw-2900-obr"
  # 1.1 kW
  "/silniki-elektryczne-1-1-kw-700-obr"
  "/silniki-elektryczne-1-1-kw-900-obr"
  "/silniki-elektryczne-1-1-kw-1400-obr"
  "/silniki-elektryczne-1-1-kw-2900-obr"
  # 1.5 kW
  "/silniki-elektryczne-1-5-kw-700-obr"
  "/silniki-elektryczne-1-5-kw-900-obr"
  "/silniki-elektryczne-1-5-kw-1400-obr"
  "/silniki-elektryczne-1-5-kw-2900-obr"
  # 2.2 kW
  "/silniki-elektryczne-2-2-kw-700-obr"
  "/silniki-elektryczne-2-2-kw-900-obr"
  "/silniki-elektryczne-2-2-kw-1400-obr"
  "/silniki-elektryczne-2-2-kw-2900-obr"
  # 3 kW
  "/silniki-elektryczne-3-kw-700-obr"
  "/silniki-elektryczne-3-kw-900-obr"
  "/silniki-elektryczne-3-kw-1400-obr"
  "/silniki-elektryczne-3-kw-2900-obr"
  # 4 kW
  "/silniki-elektryczne-4-kw-700-obr"
  "/silniki-elektryczne-4-kw-900-obr"
  "/silniki-elektryczne-4-kw-1400-obr"
  "/silniki-elektryczne-4-kw-2900-obr"
  # 5.5 kW
  "/silniki-elektryczne-5-5-kw-700-obr"
  "/silniki-elektryczne-5-5-kw-900-obr"
  "/silniki-elektryczne-5-5-kw-1400-obr"
  "/silniki-elektryczne-5-5-kw-2900-obr"
  # 7.5 kW
  "/silniki-elektryczne-7-5-kw-700-obr"
  "/silniki-elektryczne-7-5-kw-900-obr"
  "/silniki-elektryczne-7-5-kw-1400-obr"
  "/silniki-elektryczne-7-5-kw-2900-obr"
  # 11 kW
  "/silniki-elektryczne-11-kw-700-obr"
  "/silniki-elektryczne-11-kw-900-obr"
  "/silniki-elektryczne-11-kw-1400-obr"
  "/silniki-elektryczne-11-kw-2900-obr"
  # 18.5 kW
  "/silniki-elektryczne-18-5-kw-700-obr"
  "/silniki-elektryczne-18-5-kw-900-obr"
  "/silniki-elektryczne-18-5-kw-1400-obr"
  "/silniki-elektryczne-18-5-kw-2900-obr"
  # Kategorie sklepowe
  "/trojfazowe"
  "/jednofazowe"
  "/z-hamulcem"
  "/dwubiegowe"
  "/pierscieniowe"
  "/motoreduktory"
  "/akcesoria"
  "/pompy"
  "/wentylatory"
  # Strony statyczne
  "/szukaj"
  "/koszyk"
  "/qr"
  "/kontakt"
  "/o-nas"
  "/skup-silnikow"
  "/blog"
)

echo "========================================"
echo "  Sprawdzanie URL-i: $DOMAIN"
echo "  Liczba URL-i: ${#URLS[@]}"
echo "========================================"
echo ""

for url in "${URLS[@]}"; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 -H "ngrok-skip-browser-warning: true" "${DOMAIN}${url}")
  if [ "$STATUS" = "200" ]; then
    echo -e "  OK  $STATUS  $url"
    OK=$((OK + 1))
  else
    echo -e "  FAIL $STATUS  $url"
    FAIL=$((FAIL + 1))
    ERRORS="${ERRORS}\n  $STATUS  $url"
  fi
done

echo ""
echo "========================================"
echo "  WYNIK: $OK OK / $FAIL FAIL / ${#URLS[@]} TOTAL"
echo "========================================"

if [ $FAIL -gt 0 ]; then
  echo ""
  echo "  NIEDZIAŁAJĄCE:"
  echo -e "$ERRORS"
  echo ""
fi