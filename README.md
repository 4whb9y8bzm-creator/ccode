# Lineform — drawing G-code studio

A small, client-side prototype for turning text, images, and the first page of a PDF into simple pen-plotter G-code. It includes selectable Bambu Lab build-plate profiles, a live plate preview, position/size controls, monochrome and palette-color modes, approximate time/distance estimates, and downloads.

## Run it

Open `index.html` in a browser, or serve this directory with any static web server. PDF import uses Mozilla PDF.js from cdnjs, and the UI uses Google Fonts; those features need an internet connection. The app does not upload artwork to a server.

## Important printer and safety limitations

- This is a **pen-plotter workflow**, not normal 3D printing. A compatible pen attachment and a carefully verified setup are required. A standard printer nozzle may damage paper or the build plate.
- The selected Bambu profile changes the displayed plate dimensions and bounds; it does not connect to or control a printer.
- G-code output contains basic millimeter/absolute moves only. It intentionally does not include Bambu-specific start/end macros, homing, or machine connection. Review every command and adapt it for the printer/attachment before use.
- Color mode generates a combined file with a configurable pause command (default `M400 U1`) and can download one file per color. Pause support and resume prompts vary by firmware; verify command behavior first.
- Surface setup is manual. This web page cannot detect paper, auto-level, jog, or otherwise sense/control the printer. The Z value and time estimate are only approximations.
- PDF conversion imports page 1 only. Image conversion is a raster line scan; it is not vector tracing, and color quantization uses a small fixed palette.

No build step is required. The files are `index.html`, `styles.css`, and `app.js`.
