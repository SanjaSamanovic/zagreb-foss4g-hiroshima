library(dplyr)
library(readr)
library(ggplot2)
library(viridis)
library(here)

lst <- read_csv(
  here("data", "Zagreb_MO_LST_2015_2024.csv"),
  locale = locale(encoding = "UTF-8"),
  show_col_types = FALSE
)

lst <- lst %>%
  mutate(
    year = as.numeric(year),
    LST = as.numeric(LST),
    year_f = factor(year)
  )

p <- ggplot(lst, aes(x = year_f, y = LST)) +
  geom_boxplot(
    fill = "grey85",
    color = "black",
    alpha = 0.85,
    width = 0.7,
    outlier.shape = NA
  ) +
  geom_jitter(
    aes(color = year_f),
    width = 0.14,
    alpha = 0.65,
    size = 0.6
  ) +
  scale_color_viridis_d(
    option = "turbo",
    begin = 0.05,
    end = 0.95
  ) +
  labs(
    x = "Year",
    y = "LST (°C)"
  ) +
  theme_classic() +
  theme(
    legend.position = "none",
    axis.title = element_text(size = 18, face = "bold"),
    axis.text = element_text(size = 14, color = "black"),
    axis.line = element_line(linewidth = 0.8),
    panel.grid.major.y = element_line(color = "grey90", linewidth = 0.4),
    panel.grid.major.x = element_blank(),
    panel.grid.minor = element_blank()
  )

print(p)

ggsave(
  filename = here("results", "LST_interannual_variability_clean.png"),
  plot = p,
  width = 9,
  height = 6,
  dpi = 300,
  bg = "white"
)
