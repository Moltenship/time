// A shared file importing React, ui-sdk's core and an item's own file: the boundary test expects
// all three to fail, since every framework's items import a shared file. Only the kit's shared
// files may import ui-sdk's core.
import "react";
import "@ui-sdk/core/button";
import "../../calendar/core-import";
