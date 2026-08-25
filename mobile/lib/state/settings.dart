import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

class AppSettings extends ChangeNotifier {
  ThemeMode themeMode = ThemeMode.light;
  double readerSize = 16;
  bool serif = true;
  SharedPreferences? _p;

  Future<void> load() async {
    _p = await SharedPreferences.getInstance();
    themeMode = _p!.getString('theme') == 'dark' ? ThemeMode.dark : ThemeMode.light;
    readerSize = _p!.getDouble('readerSize') ?? 16;
    serif = _p!.getBool('serif') ?? true;
    notifyListeners();
  }

  void setTheme(ThemeMode m) {
    themeMode = m;
    _p?.setString('theme', m == ThemeMode.dark ? 'dark' : 'light');
    notifyListeners();
  }

  void setSize(double s) {
    readerSize = s;
    _p?.setDouble('readerSize', s);
    notifyListeners();
  }

  void setSerif(bool v) {
    serif = v;
    _p?.setBool('serif', v);
    notifyListeners();
  }
}

final settings = AppSettings();
